# Database — Storing Everything ExamGuard Sees and Does

## What Is This?

Every alert, every detection, every invigilator action, every video clip — it all needs to be SAVED somewhere. That somewhere is a **database**.

Think of a database like a super-organized spreadsheet that:
- Can hold millions of rows
- Multiple programs can read/write at the same time
- Data is safe even if the power goes out
- You can search through everything instantly

---

## WHY ExamGuard Needs a Database

### Reason 1: Evidence After the Exam

```
After exam ends, the review committee asks:
"Show us all alerts from Hall A-101, Camera 3, between 2:00 PM and 2:30 PM"

Without database: "Uh... the terminal output scrolled away. It is gone."
With database:     3 results found. Here are the video clips, timestamps,
                   seat numbers, confidence levels, and invigilator actions.
```

### Reason 2: Improving the AI

```
After 100 exams, you want to know:
- What is the false alarm rate?
- Which camera angles produce the most alerts?
- What types of cheating are most common?
- Is the system improving over time?

The database has ALL this data. Run a query, get the answer.
```

### Reason 3: Legal Protection

If a student is accused of cheating based on AI detection, you need:
- Exact timestamp of detection
- Video evidence
- Confidence level
- Which AI model flagged it
- The invigilator's decision
- Complete audit trail

**Without proper records, the system has no credibility.**

### Reason 4: Real-Time Operations

During the exam, the dashboard needs to:
- Show current alert count
- List recent alerts
- Track which alerts have been reviewed
- Show camera status (online/offline)

All of this is read from the database in real-time.

---

## What to Store

### Table 1: Exams
```
id | exam_name     | hall_id | date       | start_time | end_time | status
1  | Physics Final | A-101   | 2026-03-15 | 14:00      | 17:00    | completed
2  | Math Midterm  | B-203   | 2026-03-16 | 09:00      | 11:00    | in_progress
```

### Table 2: Cameras
```
id | camera_name  | hall_id | rtsp_url                     | status  | position
1  | Front-Left   | A-101   | rtsp://192.168.1.10:554/s1  | online  | front-left
2  | Front-Right  | A-101   | rtsp://192.168.1.11:554/s1  | online  | front-right
3  | Back-Left    | A-101   | rtsp://192.168.1.12:554/s1  | offline | back-left
```

### Table 3: Alerts (Most Important)
```
id | exam_id | camera_id | timestamp           | alert_type      | seat | confidence | priority | evidence_path              | status
1  | 1       | 3         | 2026-03-15 14:23:05 | phone_detected  | C2   | 0.92       | high     | /evidence/alert_001.mp4    | confirmed
2  | 1       | 7         | 2026-03-15 14:23:07 | sustained_gaze  | B4   | 0.78       | medium   | /evidence/alert_002.mp4    | dismissed
3  | 1       | 1         | 2026-03-15 14:23:12 | anomaly         | A1   | 0.65       | low      | /evidence/alert_003.mp4    | pending
```

### Table 4: Invigilator Actions
```
id | alert_id | invigilator_id | action     | timestamp           | notes
1  | 1        | inv_001        | confirmed  | 2026-03-15 14:23:30 | "Student had phone under paper"
2  | 2        | inv_001        | dismissed  | 2026-03-15 14:24:00 | "Student was looking at clock"
```

### Table 5: Students (Optional)
```
id   | name          | seat | exam_id | photo_path
S001 | Ahmed Khan    | A1   | 1       | /students/ahmed.jpg
S002 | Sara Ali      | B4   | 1       | /students/sara.jpg
```

---

## Technology Choices

### PostgreSQL — Main Database
```
What: A powerful, free, open-source relational database
Why: Reliable, handles millions of rows, great for structured data
Use for: Alerts, exams, cameras, students, invigilator actions
```

### Redis — Real-Time Cache
```
What: Super-fast in-memory database
Why: When dashboard needs INSTANT data (current alerts, camera status)
Use for: Current active alerts, camera heartbeats, live statistics
Speed: Reads in < 1 millisecond (PostgreSQL takes 5-20ms)
```

### Cloud/Local Storage — Video Clips
```
What: File storage for video evidence
Why: Video files are too large for a database
Use for: Alert evidence clips, full exam recordings
Options: Local disk, NAS, AWS S3, Google Cloud Storage
```

---

## Setting Up PostgreSQL

### Step 1: Install

```bash
# Windows: Download from postgresql.org
# Linux:
sudo apt install postgresql postgresql-contrib
# Mac:
brew install postgresql
```

### Step 2: Connect with Python

```bash
pip install psycopg2-binary  # PostgreSQL adapter for Python
# or
pip install sqlalchemy        # ORM (easier to use)
```

### Step 3: Create Tables

```python
import psycopg2

# Connect to PostgreSQL
conn = psycopg2.connect(
    host="localhost",
    database="examguard",
    user="postgres",
    password="your_password"
)
cursor = conn.cursor()

# Create alerts table
cursor.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER NOT NULL,
        camera_id INTEGER NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        alert_type VARCHAR(50) NOT NULL,
        seat VARCHAR(10),
        confidence FLOAT,
        priority VARCHAR(10),
        evidence_path VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending'
    )
""")

# Create invigilator_actions table
cursor.execute("""
    CREATE TABLE IF NOT EXISTS invigilator_actions (
        id SERIAL PRIMARY KEY,
        alert_id INTEGER REFERENCES alerts(id),
        invigilator_id VARCHAR(50),
        action VARCHAR(20),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
    )
""")

conn.commit()
print("Tables created!")
```

### Step 4: Insert an Alert

```python
def save_alert(exam_id, camera_id, alert_type, seat, confidence, priority, evidence_path):
    """Save a new alert to the database."""
    cursor.execute("""
        INSERT INTO alerts (exam_id, camera_id, alert_type, seat, confidence, priority, evidence_path)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """, (exam_id, camera_id, alert_type, seat, confidence, priority, evidence_path))

    alert_id = cursor.fetchone()[0]
    conn.commit()
    print(f"Alert saved with ID: {alert_id}")
    return alert_id

# When AI detects something:
save_alert(
    exam_id=1,
    camera_id=3,
    alert_type="phone_detected",
    seat="C2",
    confidence=0.92,
    priority="high",
    evidence_path="/evidence/alert_001.mp4"
)
```

### Step 5: Query Alerts

```python
# Get all high-priority alerts for an exam
def get_high_alerts(exam_id):
    cursor.execute("""
        SELECT id, camera_id, timestamp, alert_type, seat, confidence
        FROM alerts
        WHERE exam_id = %s AND priority = 'high'
        ORDER BY timestamp DESC
    """, (exam_id,))

    alerts = cursor.fetchall()
    for alert in alerts:
        print(f"Alert {alert[0]}: Camera {alert[1]}, {alert[3]} at seat {alert[4]}, "
              f"confidence {alert[5]:.0%}")
    return alerts

# Get summary after exam
def get_exam_summary(exam_id):
    cursor.execute("""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
            SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) as dismissed,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            AVG(confidence) as avg_confidence
        FROM alerts
        WHERE exam_id = %s
    """, (exam_id,))

    result = cursor.fetchone()
    print(f"Exam Summary:")
    print(f"  Total alerts: {result[0]}")
    print(f"  Confirmed: {result[1]}")
    print(f"  Dismissed (false alarms): {result[2]}")
    print(f"  Pending review: {result[3]}")
    print(f"  Average confidence: {result[4]:.0%}")
```

---

## Using SQLAlchemy (Easier Approach)

SQLAlchemy lets you use Python objects instead of writing raw SQL.

```python
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Setup
engine = create_engine('postgresql://postgres:password@localhost/examguard')
Base = declarative_base()
Session = sessionmaker(bind=engine)

# Define Alert as a Python class
class Alert(Base):
    __tablename__ = 'alerts'

    id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, nullable=False)
    camera_id = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    alert_type = Column(String(50), nullable=False)
    seat = Column(String(10))
    confidence = Column(Float)
    priority = Column(String(10))
    evidence_path = Column(String(255))
    status = Column(String(20), default='pending')

# Create tables
Base.metadata.create_all(engine)

# Save an alert (much easier!)
session = Session()
new_alert = Alert(
    exam_id=1,
    camera_id=3,
    alert_type="phone_detected",
    seat="C2",
    confidence=0.92,
    priority="high",
    evidence_path="/evidence/alert_001.mp4"
)
session.add(new_alert)
session.commit()

# Query alerts (much easier!)
high_alerts = session.query(Alert).filter_by(
    exam_id=1,
    priority='high'
).all()

for alert in high_alerts:
    print(f"Alert {alert.id}: {alert.alert_type} at seat {alert.seat}")
```

---

## Saving Evidence Video Clips

```python
import cv2
import os
from datetime import datetime

def save_evidence_clip(frames, alert_id, output_dir="/evidence"):
    """Save suspicious frames as a video clip."""
    os.makedirs(output_dir, exist_ok=True)

    filename = f"alert_{alert_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
    filepath = os.path.join(output_dir, filename)

    # Write frames to video file
    h, w = frames[0].shape[:2]
    writer = cv2.VideoWriter(
        filepath,
        cv2.VideoWriter_fourcc(*'mp4v'),
        15,  # fps
        (w, h)
    )

    for frame in frames:
        writer.write(frame)
    writer.release()

    print(f"Evidence saved: {filepath}")
    return filepath

# Usage: Keep a buffer of recent frames
from collections import deque
frame_buffer = deque(maxlen=90)  # Last 3 seconds at 30fps

while True:
    frame = camera.read()
    frame_buffer.append(frame)

    if ai_detects_something:
        # Save the last 3 seconds as evidence
        evidence_path = save_evidence_clip(list(frame_buffer), alert_id)
        save_alert(..., evidence_path=evidence_path)
```

---

## What You Need to Learn

1. **SQL basics** — SELECT, INSERT, UPDATE, WHERE, JOIN, COUNT, AVG
2. **Database design** — How to organize tables and relationships
3. **Python database connection** — psycopg2 or SQLAlchemy
4. **Indexing** — Making queries fast (important for large datasets)
5. **Backup** — How to back up exam data safely

### SQL Cheat Sheet (The Essentials)

```sql
-- Insert a new alert
INSERT INTO alerts (exam_id, camera_id, alert_type, seat, confidence)
VALUES (1, 3, 'phone_detected', 'C2', 0.92);

-- Get all alerts for an exam
SELECT * FROM alerts WHERE exam_id = 1;

-- Get high-priority alerts
SELECT * FROM alerts WHERE priority = 'high' ORDER BY timestamp DESC;

-- Update alert status
UPDATE alerts SET status = 'confirmed' WHERE id = 1;

-- Count alerts by type
SELECT alert_type, COUNT(*) FROM alerts GROUP BY alert_type;

-- Get average confidence by camera
SELECT camera_id, AVG(confidence) FROM alerts GROUP BY camera_id;

-- Get alerts with invigilator actions (JOIN)
SELECT a.*, ia.action, ia.notes
FROM alerts a
LEFT JOIN invigilator_actions ia ON a.id = ia.alert_id
WHERE a.exam_id = 1;
```

---

## Mini Project: Alert Logging System

### Goal
Build a simple system that stores alerts and lets you query them.

**Step 1: Use SQLite (No Installation Needed)**
```python
import sqlite3
from datetime import datetime

# SQLite creates a file — no server needed!
conn = sqlite3.connect('examguard.db')
cursor = conn.cursor()

# Create table
cursor.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id INTEGER,
        timestamp TEXT,
        alert_type TEXT,
        seat TEXT,
        confidence REAL,
        priority TEXT,
        status TEXT DEFAULT 'pending'
    )
""")
conn.commit()
```

**Step 2: Add Some Alerts**
```python
import random

alert_types = ['phone_detected', 'sustained_gaze', 'anomaly', 'note_passing']
priorities = ['high', 'medium', 'low']
seats = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2']

# Insert 50 fake alerts
for i in range(50):
    cursor.execute("""
        INSERT INTO alerts (camera_id, timestamp, alert_type, seat, confidence, priority)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        random.randint(1, 4),
        datetime.now().isoformat(),
        random.choice(alert_types),
        random.choice(seats),
        round(random.uniform(0.5, 0.99), 2),
        random.choice(priorities)
    ))

conn.commit()
print("50 alerts added!")
```

**Step 3: Query the Data**
```python
# How many alerts total?
cursor.execute("SELECT COUNT(*) FROM alerts")
print(f"Total alerts: {cursor.fetchone()[0]}")

# Alerts by type
cursor.execute("SELECT alert_type, COUNT(*) FROM alerts GROUP BY alert_type")
for row in cursor.fetchall():
    print(f"  {row[0]}: {row[1]}")

# High priority alerts
cursor.execute("SELECT * FROM alerts WHERE priority = 'high' ORDER BY confidence DESC")
print("\nHigh priority alerts:")
for row in cursor.fetchall():
    print(f"  Camera {row[1]}, Seat {row[4]}, Confidence {row[5]}, Type: {row[3]}")

# Average confidence by camera
cursor.execute("SELECT camera_id, AVG(confidence), COUNT(*) FROM alerts GROUP BY camera_id")
print("\nCamera statistics:")
for row in cursor.fetchall():
    print(f"  Camera {row[0]}: Avg confidence {row[1]:.2f}, Total alerts: {row[2]}")
```

---

## Key Takeaways

1. **The database is ExamGuard's memory** — without it, every alert disappears after the exam
2. **PostgreSQL for production, SQLite for learning** — start with SQLite, upgrade later
3. **Store everything** — alerts, actions, evidence paths, timestamps, confidence scores
4. **Evidence clips go to file storage** — database stores the path, not the video file
5. **SQL is a must-learn skill** — a few basic commands cover 90% of what you need
6. **Good database design now saves pain later** — plan your tables before building
