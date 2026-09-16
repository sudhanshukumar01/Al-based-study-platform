const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (supports file://, Live Server :5500, localhost:3000)
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: "5mb" }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// Initialize Gemini
const rawApiKey = (process.env.GEMINI_API_KEY || "").trim();
const isApiKeyConfigured = Boolean(
  rawApiKey &&
  rawApiKey !== "your_api_key_here" &&
  !rawApiKey.startsWith("your_") &&
  rawApiKey.length > 20
);

let genAI = null;
let model = null;

if (isApiKeyConfigured) {
  try {
    genAI = new GoogleGenerativeAI(rawApiKey);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  } catch (initErr) {
    console.warn("⚠️ Error initializing GoogleGenerativeAI:", initErr.message);
  }
}

// Base system prompt for CS Study Buddy tutor
const SYSTEM_PROMPT = `You are "AI Study Buddy 2.0" (CS Study Buddy), an elite, friendly, and pedagogical AI tutor for computer science and engineering students.

Your areas of core expertise include:
- SQL & Database Management Systems (relational schema, normalization, indexes, queries)
- Python programming & object-oriented architecture
- Java programming & JVM internals
- C++ programming & low-level memory concepts
- JavaScript, HTML, CSS & modern web architectures
- Data Structures & Algorithms (complexity, trees, graphs, dynamic programming)
- Operating Systems (threads, processes, memory management, scheduling)
- Computer Networks (OSI layers, TCP/IP, routing, protocols)
- Compiler Design & Automata Theory (CFG, lexing, parsing, ASTs)
- Software Engineering & Testing (unit testing, CI/CD, regression testing)

Pedagogical Guidelines:
- Provide intuitive, step-by-step, and student-friendly explanations with real-world analogies.
- Use clear code snippets with proper indentation and inline comments.
- Always be encouraging, supportive, and active.
- Adapt your complexity to the student's level (Beginner, Intermediate, Advanced).
- If a question is outside computer science, politely bridge back to relevant computational principles.`;

// In-memory chat sessions per user/browser
const chatSessions = {};

// Helper: safe JSON parsing from Gemini text
function cleanAndParseJSON(rawText) {
  if (!rawText) return null;
  let text = rawText.trim();
  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*/i, "");
  text = text.replace(/\s*```$/i, "");
  text = text.trim();

  try {
    return JSON.parse(text);
  } catch (err) {
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e) {
        console.error("Failed secondary JSON parse:", e.message);
      }
    }
    throw new Error("Unable to parse structured JSON from response: " + text.slice(0, 150));
  }
}

// Check if an error indicates invalid authentication / api key
function isAuthOrQuotaError(err) {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  return (
    msg.includes("401") ||
    msg.includes("unauthorized") ||
    msg.includes("invalid authentication") ||
    msg.includes("api_key") ||
    msg.includes("api key") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("not found")
  );
}

// -------------------------------------------------------------
// BUILT-IN CS KNOWLEDGE & OFFLINE ENGINE
// Guarantees zero downtime if Gemini API key is missing or invalid
// -------------------------------------------------------------
function generateFallbackChat(message, userContext = {}) {
  const q = (message || "").toLowerCase();
  const level = userContext.learningLevel || "Intermediate";

  let answer = "";

  if (q.includes("sql") || q.includes("join") || q.includes("select") || q.includes("database") || q.includes("dbms")) {
    answer = `### 🗄️ SQL & Relational Databases Explained

SQL (Structured Query Language) is the standard language for storing, manipulating, and retrieving data in relational databases.

#### Key Concepts & Query Patterns:
\`\`\`sql
-- 1. INNER JOIN: Returns matching records from both tables
SELECT s.student_id, s.name, c.course_name
FROM Students s
INNER JOIN Enrollments e ON s.student_id = e.student_id
INNER JOIN Courses c ON e.course_id = c.course_id;

-- 2. GROUP BY with HAVING: Aggregation with post-filter
SELECT department, COUNT(*) AS student_count, AVG(gpa) AS avg_gpa
FROM Students
GROUP BY department
HAVING AVG(gpa) > 3.2;
\`\`\`

#### Essential DB Interview Topics:
1. **ACID Properties**:
   - **Atomicity**: All or nothing transaction execution.
   - **Consistency**: Database moves from one valid state to another.
   - **Isolation**: Concurrent transactions do not interfere.
   - **Durability**: Committed data survives system crashes.
2. **Indexing (B-Trees)**: Drastically speeds up \`SELECT\` lookups at the slight cost of slower \`INSERT\`/\`UPDATE\`.
3. **Normalization (1NF → 2NF → 3NF → BCNF)**: Eliminates data redundancy and insertion/deletion anomalies.`;

  } else if (q.includes("python") || q.includes("decorator") || q.includes("list comprehension") || q.includes("generator")) {
    answer = `### 🐍 Python Programming & Advanced Paradigms

Python blends object-oriented, functional, and procedural styles.

#### 1. List Comprehensions & Generators:
\`\`\`python
# List comprehension (eager evaluation in memory)
squares = [x**2 for x in range(10) if x % 2 == 0]

# Generator expression (lazy evaluation for large streams)
squares_gen = (x**2 for x in range(1000000) if x % 2 == 0)
print(next(squares_gen)) # Computes only the next item
\`\`\`

#### 2. Decorators (Functions modifying functions):
\`\`\`python
import time

def timing_decorator(func):
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        duration = time.perf_counter() - start
        print(f"[{func.__name__}] executed in {duration:.5f}s")
        return result
    return wrapper

@timing_decorator
def compute_data():
    return sum(i for i in range(100000))
\`\`\`

#### Core Python Principles to Remember:
- **Mutable vs Immutable**: Lists, dicts, and sets are mutable; strings, tuples, and ints are immutable.
- **GIL (Global Interpreter Lock)**: CPython's mechanism ensuring only one thread executes bytecode at a time. Use \`multiprocessing\` or \`asyncio\` for true parallel tasks.`;

  } else if (q.includes("dsa") || q.includes("data structure") || q.includes("algorithm") || q.includes("sort") || q.includes("tree") || q.includes("graph") || q.includes("big o")) {
    answer = `### ⚡ Data Structures & Algorithms Core Guide

#### Time Complexity Cheat Sheet (Big-O):
- **Hash Table / Map**: Lookup $O(1)$ avg, $O(n)$ worst.
- **Binary Search**: $O(\\log n)$ on sorted arrays.
- **QuickSort**: $O(n \\log n)$ average, $O(n^2)$ worst-case with bad pivot.
- **MergeSort**: Guarantees $O(n \\log n)$ time, $O(n)$ auxiliary space.

#### Binary Search Implementation (Python):
\`\`\`python
def binary_search(arr, target):
    low, high = 0, len(arr) - 1
    while low <= high:
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1 # Not found
\`\`\`

#### Tree Traversal Orders:
- **Pre-order (Root, Left, Right)**: Great for copying/serializing a tree.
- **In-order (Left, Root, Right)**: Produces sorted order in a Binary Search Tree (BST).
- **Post-order (Left, Right, Root)**: Ideal for deleting nodes or bottom-up calculation.`;

  } else if (q.includes("os") || q.includes("operating system") || q.includes("process") || q.includes("thread") || q.includes("deadlock")) {
    answer = `### 💻 Operating Systems Fundamentals

#### 1. Process vs Thread:
- **Process**: An executing program instance with its own isolated address space, PCB (Process Control Block), and memory. High context switch overhead.
- **Thread**: A lightweight unit of execution within a process sharing the code, data, and open files, but having its own stack and registers.

#### 2. The 4 Coffman Conditions for Deadlock:
All four must hold simultaneously for a deadlock to occur:
1. **Mutual Exclusion**: Non-shareable resource.
2. **Hold and Wait**: Process holding resources requests more.
3. **No Preemption**: Resources cannot be forcibly taken away.
4. **Circular Wait**: A closed chain of processes waiting for resources held by each other.

#### 3. Virtual Memory & Paging:
Virtual addresses are mapped to physical RAM frames via the **Page Table**. If a requested page is not in RAM, a **Page Fault** triggers the OS to swap it in from disk.`;

  } else if (q.includes("network") || q.includes("osi") || q.includes("tcp") || q.includes("udp") || q.includes("http")) {
    answer = `### 🌐 Computer Networks & Protocols

#### The 7 OSI Reference Layers (Bottom to Top):
1. **Physical**: Bits over wire/fiber/radio (Ethernet, Wi-Fi PHY).
2. **Data Link**: Frames, MAC addressing, error checking (Ethernet, Switches).
3. **Network**: Packets, IP addressing, path routing (IPv4, IPv6, Routers).
4. **Transport**: Segments, end-to-end reliability (TCP, UDP).
5. **Session**: Dialog control, session checkpoints.
6. **Presentation**: Encoding, encryption, compression (TLS/SSL).
7. **Application**: End-user protocols (HTTP/HTTPS, DNS, SSH, SMTP).

#### TCP vs UDP:
- **TCP**: Connection-oriented, guarantees in-order reliable delivery via 3-Way Handshake (\`SYN\` → \`SYN-ACK\` → \`ACK\`), flow control, and congestion control.
- **UDP**: Connectionless, best-effort lightweight datagrams without retransmission. Perfect for DNS, video streaming, and online gaming.`;

  } else {
    answer = `### 🎓 AI Study Buddy Tutor Response

I am here to assist you in mastering **Computer Science**, engineering fundamentals, and coding!

#### What you can ask me:
- 🗄️ **SQL & DBMS**: Normalization, JOINs, indexing, ACID transactions.
- 🐍 **Python & Java**: Object-Oriented Design, multithreading, collections.
- ⚡ **Data Structures**: Trees, graphs, dynamic programming, sorting algorithms.
- 💻 **Operating Systems**: Deadlocks, paging, processes vs threads, CPU scheduling.
- 🌐 **Networks**: OSI model, TCP 3-way handshake, DNS, HTTP/HTTPS.
- 📝 **Code Review**: Share any code snippet for line-by-line debugging.

> 💬 *Try typing: "Explain SQL Joins with examples", "How does Binary Search work?", or "Difference between Process and Thread".*`;
  }

  // Prepend offline banner if Gemini is not actively answering
  const notice = `> 💡 **Study Buddy Mode**: Built-in Knowledge Base active.\n\n`;
  return notice + answer;
}

// Fallback Quiz Generator
function generateFallbackQuiz(subject, count = 5, diff = "Intermediate") {
  const fallbackBanks = {
    SQL: [
      {
        q: "Which SQL clause is executed AFTER the GROUP BY clause to filter aggregated groups?",
        options: ["WHERE", "HAVING", "ORDER BY", "FILTER"],
        ans: 1,
        explanation: "HAVING filters groups created by GROUP BY, whereas WHERE filters individual rows before grouping.",
        topic: "SQL Aggregation"
      },
      {
        q: "What type of JOIN returns all records from the left table and matched records from the right table?",
        options: ["INNER JOIN", "FULL OUTER JOIN", "LEFT JOIN", "CROSS JOIN"],
        ans: 2,
        explanation: "A LEFT (OUTER) JOIN retains all rows from the left table regardless of whether a match exists on the right.",
        topic: "SQL JOINs"
      },
      {
        q: "Which normal form removes partial dependencies (non-prime attributes depending on part of a composite key)?",
        options: ["1NF", "2NF", "3NF", "BCNF"],
        ans: 1,
        explanation: "2NF requires the relation to be in 1NF and have no partial dependency on any candidate key.",
        topic: "Normalization"
      },
      {
        q: "What data structure is standard for indexing relational database tables?",
        options: ["Binary Heap", "B+ Tree", "Linked List", "Stack"],
        ans: 1,
        explanation: "B+ Trees provide high fan-out, shallow depth, and fast range queries across disk blocks.",
        topic: "Indexing"
      },
      {
        q: "What does the 'I' in ACID transaction properties stand for?",
        options: ["Integrity", "Iteration", "Isolation", "Immutability"],
        ans: 2,
        explanation: "Isolation ensures concurrent execution of transactions leaves the database in the same state as if executed sequentially.",
        topic: "ACID Properties"
      }
    ],
    Python: [
      {
        q: "Which Python data structure is immutable?",
        options: ["List", "Dictionary", "Set", "Tuple"],
        ans: 3,
        explanation: "Tuples cannot be modified after creation, making them hashable and memory efficient.",
        topic: "Data Types"
      },
      {
        q: "What does the 'yield' keyword do in a Python function?",
        options: ["Terminates the program", "Converts function into a generator", "Creates a thread", "Imports a module"],
        ans: 1,
        explanation: "The 'yield' statement suspends execution and yields values one at a time, creating a lazy generator.",
        topic: "Generators"
      },
      {
        q: "What is the average time complexity of looking up a key in a Python dictionary?",
        options: ["O(1)", "O(log n)", "O(n)", "O(n^2)"],
        ans: 0,
        explanation: "Python dictionaries use hash tables, giving amortized O(1) average lookup and insertion time.",
        topic: "Complexity"
      },
      {
        q: "What does the @property decorator do in Python?",
        options: ["Marks a method as static", "Defines a getter method accessible as an attribute", "Makes a class singleton", "Compiles C extensions"],
        ans: 1,
        explanation: "The @property decorator allows defining methods that can be accessed like attributes without explicit function call parentheses.",
        topic: "OOP"
      }
    ]
  };

  const selectedBank = fallbackBanks[subject] || fallbackBanks["SQL"];
  return selectedBank.slice(0, count);
}

// Fallback Study Plan Generator
function generateFallbackPlan(subjects = ["SQL", "Python"], targetExam = "CS Exams", dailyHours = "2 hours") {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const subList = subjects.length > 0 ? subjects : ["SQL", "Data Structures", "Operating Systems", "Python"];

  return days.map((day, idx) => {
    const mainSub = subList[idx % subList.length];
    const secSub = subList[(idx + 1) % subList.length];
    return {
      dayName: `Day ${idx + 1} - ${day}`,
      theme: `${mainSub} Mastery & Practice`,
      tasks: [
        {
          id: `task_${idx}_1`,
          time: "09:00 - 09:50",
          subject: mainSub,
          title: `Core Theory & Key Concepts Review: ${mainSub}`,
          type: "Study",
          duration: "50m"
        },
        {
          id: `task_${idx}_2`,
          time: "10:00 - 10:45",
          subject: mainSub,
          title: `Hands-on Code Practice / Problem Solving`,
          type: "Practice",
          duration: "45m"
        },
        {
          id: `task_${idx}_3`,
          time: "18:00 - 18:30",
          subject: secSub,
          title: `Spaced Repetition Flashcards & Quick Quiz`,
          type: "Flashcards",
          duration: "30m"
        }
      ]
    };
  });
}

// -------------------------------------------------------------
// ROUTES & API ENDPOINTS
// -------------------------------------------------------------

// 1. CHAT ENDPOINT
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId, userContext } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    const sid = sessionId || "default";

    // Attempt Gemini call if model is initialized
    if (model) {
      try {
        let contextualSystemPrompt = SYSTEM_PROMPT;
        if (userContext && typeof userContext === "object") {
          const level = userContext.learningLevel || "Intermediate";
          const targetExam = userContext.targetExam || "General CS Prep";
          const weakTopics = Array.isArray(userContext.weakTopics) ? userContext.weakTopics.join(", ") : "";
          contextualSystemPrompt += `\n\nStudent Profile:\n- Learning Level: ${level}\n- Target Exam/Goal: ${targetExam}\n- Identified Weak Topics: ${weakTopics || "None yet"}\nTailor explanations to their level and help reinforce these weak areas when relevant.`;
        }

        if (!chatSessions[sid]) {
          chatSessions[sid] = model.startChat({
            history: [
              {
                role: "user",
                parts: [{ text: contextualSystemPrompt }],
              },
              {
                role: "model",
                parts: [
                  {
                    text: "Hello! I'm your AI Study Buddy 2.0 🚀 Ready to help you master Computer Science concepts, write clean code, solve tricky problems, and prepare for your exams. What are we studying today?",
                  },
                ],
              },
            ],
          });
        }

        const chat = chatSessions[sid];
        const result = await chat.sendMessage(message);
        const reply = result.response.text();
        return res.json({ reply });
      } catch (geminiError) {
        console.warn("⚠️ Gemini API Call Failed (Falling back to built-in knowledge engine):", geminiError.message);
        // Fall through to offline knowledge engine
      }
    }

    // High-yield offline fallback tutor response
    const fallbackReply = generateFallbackChat(message, userContext);
    return res.json({ reply: fallbackReply });

  } catch (error) {
    console.error("Chat Server Error:", error.message);
    const fallback = generateFallbackChat(req.body ? req.body.message : "", req.body ? req.body.userContext : {});
    res.json({ reply: fallback });
  }
});

// 2. DYNAMIC AI QUIZ GENERATOR
app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { subject, difficulty, numQuestions, questionType, weakTopics } = req.body;

    if (!subject) {
      return res.status(400).json({ error: "Subject is required" });
    }

    const count = Math.min(Math.max(parseInt(numQuestions, 10) || 5, 3), 20);
    const diff = difficulty || "Intermediate";
    const qType = questionType || "MCQ";

    if (model) {
      try {
        const weakFocus = weakTopics && weakTopics.length > 0 ? `Specially target and include questions on these student weak areas: ${weakTopics.join(", ")}.` : "";
        const prompt = `Generate a ${count}-question technical quiz on "${subject}" at "${diff}" difficulty.
Question type: ${qType} (MCQ with 4 choices or True/False with 2 choices).
${weakFocus}

CRITICAL: Return ONLY valid JSON as an array of question objects without markdown tags or explanations outside JSON.
Each question object MUST strictly match this schema:
[
  {
    "q": "Clear, concise technical question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "ans": 0,
    "explanation": "Clear explanation of why this answer is correct and others are wrong",
    "topic": "Specific subtopic name"
  }
]`;

        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
          },
        });

        const questions = cleanAndParseJSON(result.response.text());
        if (Array.isArray(questions) && questions.length > 0) {
          const sanitizedQuestions = questions.slice(0, count).map((item, idx) => ({
            q: String(item.q || `Question ${idx + 1}`),
            options: Array.isArray(item.options) && item.options.length >= 2 ? item.options.map(String) : ["True", "False"],
            ans: typeof item.ans === "number" && item.ans >= 0 && item.ans < (item.options ? item.options.length : 2) ? item.ans : 0,
            explanation: String(item.explanation || "Correct option selected."),
            topic: String(item.topic || subject),
          }));

          return res.json({
            subject,
            difficulty: diff,
            total: sanitizedQuestions.length,
            questions: sanitizedQuestions,
          });
        }
      } catch (geminiErr) {
        console.warn("⚠️ Gemini Quiz Generator Failed (Using fallback bank):", geminiErr.message);
      }
    }

    // Fallback Quiz
    const fallbackQuestions = generateFallbackQuiz(subject, count, diff);
    res.json({
      subject,
      difficulty: diff,
      total: fallbackQuestions.length,
      questions: fallbackQuestions,
    });

  } catch (error) {
    console.error("Quiz Generation Error:", error.message);
    const fallbackQuestions = generateFallbackQuiz("SQL", 5, "Intermediate");
    res.json({
      subject: "SQL",
      difficulty: "Intermediate",
      total: fallbackQuestions.length,
      questions: fallbackQuestions,
    });
  }
});

// 3. STUDY PLANNER GENERATOR
app.post("/api/generate-study-plan", async (req, res) => {
  try {
    const { subjects, examDate, dailyStudyTime, preferredStudyTime, difficultyLevel, prioritySubjects, weakTopics } = req.body;

    const subList = Array.isArray(subjects) && subjects.length > 0 ? subjects.join(", ") : "Computer Science Core";
    const prioList = Array.isArray(prioritySubjects) && prioritySubjects.length > 0 ? prioritySubjects.join(", ") : "All equally";
    const weakList = Array.isArray(weakTopics) && weakTopics.length > 0 ? weakTopics.join(", ") : "None specified";

    if (model) {
      try {
        const prompt = `You are an expert academic tutor and scheduling planner.
Generate a structured, actionable 7-day personalized study schedule for a CS student.

Student Constraints:
- Subjects to prepare: ${subList}
- Target Exam / Deadline: ${examDate || "Upcoming Semester Exams"}
- Daily Study Budget: ${dailyStudyTime || "2 hours"} per day
- Preferred Study Slot: ${preferredStudyTime || "Evening (18:00 - 20:00)"}
- Academic Level: ${difficultyLevel || "Intermediate"}
- High Priority Subjects: ${prioList}
- Identified Weak Subtopics: ${weakList}

CRITICAL: Return ONLY valid JSON array of 7 day schedule objects. Format:
[
  {
    "dayName": "Day 1 - Monday",
    "theme": "Theme or Focus Subject",
    "tasks": [
      {
        "id": "t1",
        "time": "09:00 - 09:45",
        "subject": "SQL",
        "title": "SQL Subqueries & JOINs Deep Dive",
        "type": "Study",
        "duration": "45m"
      }
    ]
  }
]`;

        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
          },
        });

        const plan = cleanAndParseJSON(result.response.text());
        if (Array.isArray(plan) && plan.length > 0) {
          return res.json({ plan });
        }
      } catch (geminiErr) {
        console.warn("⚠️ Gemini Study Plan Failed (Using fallback generator):", geminiErr.message);
      }
    }

    // Fallback Plan
    const fallbackPlan = generateFallbackPlan(subjects, examDate, dailyStudyTime);
    res.json({ plan: fallbackPlan });

  } catch (error) {
    console.error("Study Plan Generator Error:", error.message);
    res.json({ plan: generateFallbackPlan() });
  }
});

// 4. NOTES AI ACTION (Summarize, Key Concepts, Exam Questions)
app.post("/api/summarize", async (req, res) => {
  try {
    const { text, mode, title } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Note content is required" });
    }

    if (model) {
      try {
        let instruction = "Provide a high-yield, structured summary with key takeaways and bullet points.";
        if (mode === "concepts") {
          instruction = "Extract the core technical concepts, definitions, formulas/rules, and key terms in clean bullet points.";
        } else if (mode === "questions") {
          instruction = "Formulate 5 to 7 high-probability exam questions with concise model answers based on this material.";
        }

        const prompt = `Title: ${title || "Computer Science Notes"}
Content:
${text.slice(0, 10000)}

Task: ${instruction}
Format the output in clean, readable markdown with bold key terms and bullet points.`;

        const result = await model.generateContent(prompt);
        return res.json({ result: result.response.text() });
      } catch (geminiErr) {
        console.warn("⚠️ Gemini Summarize Failed (Using fallback):", geminiErr.message);
      }
    }

    // Fallback Summarizer
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    const summary = `### 📋 Summary & Key Highlights
**Target:** ${title || "Study Note"}

- **Core Overview**: ${lines[0] || "Essential technical notes for revision."}
- **Key Points**:
${lines.slice(1, 5).map(l => `  - ${l}`).join("\n") || "  - Review foundational concepts regularly."}

> 💡 *Tip: Test yourself on these concepts using the Flashcards and Quick Quiz modules!*`;

    res.json({ result: summary });

  } catch (error) {
    console.error("Summarize Error:", error.message);
    res.status(500).json({ error: "Could not process note: " + error.message });
  }
});

// 5. FLASHCARDS GENERATOR
app.post("/api/generate-flashcards", async (req, res) => {
  try {
    const { content, subject, count } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required to generate flashcards." });
    }

    const cardCount = Math.min(Math.max(parseInt(count, 10) || 4, 2), 10);

    if (model) {
      try {
        const prompt = `You are a spaced-repetition flashcard generator for CS students.
Generate ${cardCount} high-yield flashcards from the following content on "${subject || "Computer Science"}":
"${content.slice(0, 8000)}"

Return ONLY valid JSON array with schema:
[
  {
    "front": "Concise Question or Prompt",
    "back": "Clear, informative answer (1-3 sentences max)",
    "topic": "${subject || "General"}"
  }
]`;

        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
          },
        });

        const cards = cleanAndParseJSON(result.response.text());
        if (Array.isArray(cards) && cards.length > 0) {
          return res.json({ cards });
        }
      } catch (geminiErr) {
        console.warn("⚠️ Gemini Flashcards Generator Failed (Using fallback):", geminiErr.message);
      }
    }

    // Fallback Flashcards
    const fallbackCards = [
      {
        front: `What is the primary concept covered in "${subject || "this note"}"?`,
        back: content.slice(0, 160).replace(/\n/g, " ") + "...",
        topic: subject || "General"
      },
      {
        front: `How does ${subject || "this concept"} apply in practical software engineering?`,
        back: "It optimizes performance, ensures correctness, and reduces resource consumption during execution.",
        topic: subject || "General"
      }
    ];

    res.json({ cards: fallbackCards });

  } catch (error) {
    console.error("Flashcards Error:", error.message);
    res.status(500).json({ error: "Could not generate flashcards: " + error.message });
  }
});

// 6. EXPLAIN CONCEPT IN DEPTH / SIMPLIFIED
app.post("/api/explain", async (req, res) => {
  try {
    const { concept, mode, level } = req.body;

    if (!concept || !concept.trim()) {
      return res.status(400).json({ error: "Concept is required." });
    }

    if (model) {
      try {
        let modePrompt = "Explain this computer science concept clearly with intuitive analogies and concise code snippets.";
        if (mode === "simpler") {
          modePrompt = "Explain this concept like I am a beginner (ELI5). Use simple analogies, avoid confusing jargon, and provide a tiny, clear illustration.";
        } else if (mode === "step-by-step") {
          modePrompt = "Break down how this works step-by-step from fundamental principles to complete execution.";
        } else if (mode === "practice-problem") {
          modePrompt = "Provide a realistic interview/exam practice problem on this topic, followed by hints and a fully explained solution.";
        }

        const prompt = `Concept: "${concept}"
Student Level: ${level || "Intermediate"}
Goal: ${modePrompt}

Format with clean Markdown, bold headers, and highlighted code blocks where relevant.`;

        const result = await model.generateContent(prompt);
        return res.json({ explanation: result.response.text() });
      } catch (geminiErr) {
        console.warn("⚠️ Gemini Explain Failed (Using fallback):", geminiErr.message);
      }
    }

    const fallback = generateFallbackChat(`Explain ${concept}`, { learningLevel: level });
    res.json({ explanation: fallback });

  } catch (error) {
    console.error("Explain Error:", error.message);
    res.status(500).json({ error: "Could not generate explanation: " + error.message });
  }
});

// Serve main web page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "bt.html"));
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    geminiConfigured: isApiKeyConfigured,
    model: "gemini-1.5-flash",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Start the server
const server = app.listen(PORT, () => {
  console.log("==========================================================");
  console.log(" 🚀 AI STUDY BUDDY 2.0 IS LIVE & READY!");
  console.log(` 🌐 Web Application: http://localhost:${PORT}`);
  console.log(` 🩺 Health Check:    http://localhost:${PORT}/api/health`);
  console.log(` 🔑 Gemini Key:      ${isApiKeyConfigured ? "Configured (gemini-1.5-flash)" : "Offline Knowledge Engine active"}`);
  console.log("==========================================================");
});
