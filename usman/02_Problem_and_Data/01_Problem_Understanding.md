# 1. Problem Understanding — "How to Think Like an ML Engineer"

> **The #1 skill in AI is NOT coding or math. It's understanding the PROBLEM.**

---

## The Golden Rule

> **Don't start with "which model?" Start with "what would a HUMAN do?"**

Every ML project starts the same way:
1. Someone gives you a vague goal
2. You break it into specific tasks
3. For each task, you figure out what a human would do
4. THEN you figure out which ML approach matches

---

## Step 1: Turn Vague Goals into Specific Tasks

| Vague Goal | Ask "What SPECIFICALLY?" | Specific Tasks |
|:---|:---|:---|
| "Use AI for our hospital" | "What decisions do doctors struggle with?" | Predict disease, spot abnormal reports, smart ICU alerts |
| "Make our store smarter" | "What costs you money or time right now?" | Predict demand, detect fraud returns, group customers |
| "Build ExamGuard" | "What does cheating LOOK like? List every type." | Phone on desk, looking sideways, unusual behavior, identical answers |
| "AI for cricket team" | "What does the coach actually DO?" | Analyze opponent, predict player form, field placement |

**Technique: Keep asking "but what EXACTLY?" until you get something a human can physically DO.**

---

## Step 2: Watch the Human Expert

For each specific task, watch (or imagine) a human doing it:

### Example: Hospital

| Human does this | Data they use | How they think | ML Match |
|:---|:---|:---|:---|
| Doctor reads X-ray | IMAGES | "I've seen 1000 X-rays, this one shows pneumonia" — recognizing from past examples | Supervised → CNN |
| Nurse checks vitals | NUMBERS | "BP 180 and sugar 400 is dangerous together" — comparing to known dangerous combinations | Supervised → Classification |
| Doctor notices weird lab report | NUMBERS | "This doesn't look right but I can't explain why" — gut feeling about normal vs abnormal | Anomaly Detection |
| ICU decides ventilator settings | NUMBERS + JUDGMENT | "If I set too high = lung damage. Too low = not enough oxygen. Depends on patient weight, condition, history" | RL (balancing tradeoffs) |
| Receptionist identifies patient | FACE | "I remember this face" — visual recognition | Supervised → CNN (face recognition) |
| Admin assigns rooms | RULES | "ICU patients go to floor 3, general to floor 1" | NOT ML — just if/else rules! |

### Example: ExamGuard

| Human does this | Data they use | How they think | ML Match |
|:---|:---|:---|:---|
| Spots phone | VISUAL | "That rectangular thing = phone" — object recognition | Supervised → YOLO |
| Notices copying | VISUAL | "Head turned toward neighbor for 30 seconds" — behavior pattern | Supervised → CNN + Pose |
| Senses something wrong | VISUAL | "Something off but can't say what" — gut feeling | Anomaly → Autoencoder |
| Decides to intervene | JUDGMENT | "Is it worth disrupting? Am I sure enough?" — balancing risk | RL |
| Verifies student identity | FACE vs ID | "Does face match ID card?" — comparison | Supervised → Face Recognition |
| Counts students | COUNTING | "30 desks, 28 present" — counting objects | YOLO (counting detected objects) |

---

## Step 3: Identify What DOESN'T Need ML

This is equally important. Not everything needs AI:

| Task | ML or Not? | Why |
|:---|:---|:---|
| "If temperature > 38°C, flag as fever" | NOT ML — simple rule | One number, one threshold |
| "If student absent > 5 days, notify parents" | NOT ML — simple rule | Counting + threshold |
| "Look up patient by bed number" | NOT ML — database query | Just a search |
| "Calculate BMI from height and weight" | NOT ML — formula | weight / height² |
| "Detect pneumonia from X-ray" | YES ML | Complex visual pattern no formula can capture |
| "Predict which patients will readmit" | YES ML | Complex interaction of 20+ factors |

**Rule: If a human can write the logic as a simple IF-ELSE or formula → don't use ML. ML is for when the pattern is too complex for human-written rules.**

---

## Step 4: Define Success BEFORE Building

Before writing any code, answer:

| Question | Why it matters | ExamGuard Example |
|:---|:---|:---|
| "What does SUCCESS look like?" | So you know when you're done | "Detect 90% of phone usage" |
| "What's ACCEPTABLE failure?" | Every model makes mistakes | "False alarms on max 5% of innocent students" |
| "Who is the USER?" | Affects what you build | "Invigilator gets alert on screen" |
| "What happens with the output?" | ML is useless if output isn't used | "Alert shows camera snapshot + confidence %" |
| "What's the WORST case mistake?" | Some mistakes are costlier | "Missing real cheating is worse than false alarm" |

---

## The Problem Understanding Checklist

Before moving to data collection, you should have:

- [ ] Clear problem statement: "I want to ___________"
- [ ] List of specific sub-tasks (not vague goals)
- [ ] For each task: what data type (visual/text/numbers)?
- [ ] For each task: how does a human think? (recognize/sense abnormal/judge)
- [ ] Which tasks DON'T need ML (simple rules)
- [ ] Success criteria (what accuracy is "good enough"?)
- [ ] Failure tolerance (what mistakes are acceptable?)

---

## Mini Summary

- Start with the HUMAN, not the model
- Break vague goals into specific observable tasks
- Watch HOW the human thinks → that tells you the ML type
- Not everything needs ML — simple rules are fine for simple logic
- Define success BEFORE building

> 📝 *Next: [02_The_3_Questions.md](02_The_3_Questions.md) — The core skill: decompose any problem into ML tasks*
