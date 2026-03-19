# DBSCAN (Density-Based Spatial Clustering of Applications with Noise)

## What It Does

DBSCAN finds groups in your data **without you telling it how many groups there are.** It looks for areas where data points are packed closely together (dense areas) and calls those clusters. Points that are alone in empty areas get labeled as **outliers.** It discovers the groups AND spots the weirdos — all by itself.

---

## Real-World Example

### Problem: Delivery Truck Route Analysis

A logistics company has **GPS data from 200 delivery trucks** over the past month. Each truck's data shows: routes taken, areas covered, and time spent in each area.

The company wants to know: **What types of routes do our trucks take? Are any trucks doing something weird?**

But they don't know how many types of routes exist. They can't choose K like in K-Means.

### Solution: DBSCAN

DBSCAN scans the GPS data and **automatically** finds:

| Cluster | Type | Trucks | Description |
|---------|------|--------|-------------|
| **Cluster 1** | City Routes | 85 trucks | Short distances, many stops, slow speed, downtown area |
| **Cluster 2** | Highway Routes | 60 trucks | Long distances, few stops, high speed, between cities |
| **Cluster 3** | Suburban Routes | 45 trucks | Medium distances, moderate stops, residential areas |
| **Cluster 4** | Mixed Routes | 8 trucks | Combination of city + highway |
| **OUTLIERS** | Weird Routes | 2 trucks | Went to locations not in any delivery zone! |

**Nobody told DBSCAN there are 4 types of routes.** It figured that out on its own. And it found 2 trucks going to wrong locations — those might be personal trips or even theft!

---

## How It Works (The Friend Groups Analogy)

Think about **friend groups in school.** Nobody assigns you to a group. Groups just **naturally form.**

### How do friend groups form?

**Step 1: Look at who stands close together**
- During lunch break, some kids naturally cluster together
- If 5 kids are all standing within arm's reach of each other → they're a group!

**Step 2: Groups grow by connection**
- If Ahmad is close to Bilal, and Bilal is close to Chinmay → Ahmad and Chinmay are in the same group (through Bilal)
- The group keeps growing as long as people are connected through closeness

**Step 3: Loners are outliers**
- Asim is standing alone in the corner, far from everyone
- He's not close enough to ANY group → he's an **outlier** (noise)

```
The School Yard:

  👤👤👤  ← Group 1 (standing close together)
   👤👤

              👤👤  ← Group 2 (standing close together)
              👤👤👤

                          👤  ← OUTLIER (standing alone)

  👤👤👤👤  ← Group 3 (standing close together)
```

### DBSCAN Does Exactly This:
- **Epsilon (eps)** = How close is "close enough" to be friends (arm's reach distance)
- **Min Points** = Minimum number of friends needed to form a group (at least 3 kids)
- Any point with enough neighbors → **core point** (popular kid who starts a group)
- Points connected through core points → **same cluster**
- Points with no nearby friends → **outliers/noise**

---

## K-Means vs DBSCAN — When to Use Which?

| Feature | K-Means | DBSCAN |
|---------|---------|--------|
| **Choose number of groups?** | YES — you must pick K | NO — it finds groups automatically |
| **Handles outliers?** | NO — forces every point into a group | YES — labels outliers as noise |
| **Group shapes** | Only round/blob shapes | ANY shape (crescents, rings, blobs) |
| **Speed** | Very fast | Slower on huge datasets |
| **Ease of use** | Just pick K | Need to tune epsilon and min_points |
| **Best for** | When you know roughly how many groups | When you have no idea + data has noise |

---

## When to Use DBSCAN

- **You don't know how many groups exist** — DBSCAN figures it out
- **Your data has outliers/noise** — DBSCAN naturally separates them
- **Groups have weird shapes** — not just round blobs (rings, curves, irregular shapes)
- **You want to discover BOTH groups and outliers** at the same time
- **GPS/location data** — finding clusters of locations
- **Fraud detection** — normal transactions cluster together, fraud is isolated

## When NOT to Use DBSCAN

- **Very high-dimensional data** — when data has 100+ features, distance becomes meaningless (everything looks equally far apart)
- **Huge datasets (millions of rows)** — DBSCAN can be very slow. K-Means handles big data better.
- **Groups have very different densities** — if one group is tightly packed and another is spread out, DBSCAN struggles (it uses ONE epsilon for everything)
- **You need speed** — K-Means is much faster

---

## ExamGuard AI Connection

### How DBSCAN Helps ExamGuard

DBSCAN is perfect for ExamGuard because we **don't know in advance** how many types of student behavior exist. Every exam is different!

**Scenario:** Exam hall with 100 students. DBSCAN analyzes their movement, gaze, and hand patterns:

```
DBSCAN Result:

Cluster 1 (72 students): Normal exam behavior
  → Head down, writing, occasional look up

Cluster 2 (12 students): Thinking/stressed behavior
  → Fidgeting, looking around, but NOT at neighbors

Cluster 3 (8 students): Coordinated behavior
  → These 8 students look up at the same times!
  → They sit near each other
  → Possible organized cheating!

OUTLIERS (3 students):
  → Student A: Hasn't written anything for 20 minutes
  → Student B: Keeps touching ear (earpiece?)
  → Student C: Looking at phone under desk
```

### Why DBSCAN Instead of K-Means Here?

1. **We don't know K** — every exam has different behavior patterns
2. **We NEED outliers** — the outliers (Student A, B, C) are the most important findings!
3. **Behavior patterns aren't round blobs** — they have complex shapes that K-Means can't handle

---

## Key Terms

| Term | Meaning | Example |
|------|---------|---------|
| **DBSCAN** | Density-Based Clustering | Groups based on how crowded an area is |
| **Epsilon (eps)** | The "closeness" distance — how near two points must be to be neighbors | 0.5 meters = within arm's reach |
| **Min Points** | Minimum neighbors needed to form a group | At least 3 friends to count as a group |
| **Core Point** | A point with enough neighbors (>= min_points) | The popular kid who forms a group |
| **Border Point** | A point near a core point but without enough neighbors of its own | The quiet kid who hangs with the group |
| **Noise / Outlier** | A point too far from any cluster | The loner standing alone in the corner |
| **Density** | How packed together points are | Crowded area = high density, empty area = low density |

---

## Quick Summary

```
DBSCAN in one line:
"Find areas where points are packed together = clusters. Points standing alone = outliers."

Input:  200 delivery trucks' GPS data (no labels, no K)
Output: 4 route types + 2 outlier trucks

You choose: epsilon (closeness) and min_points
It finds:  How many groups exist + which points are outliers
```
