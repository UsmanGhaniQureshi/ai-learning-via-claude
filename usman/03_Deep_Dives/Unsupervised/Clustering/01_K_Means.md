# K-Means Clustering

## What It Does

K-Means takes your data and **groups it into K groups** (you choose K). It puts similar things together and different things apart — like sorting a mixed bag of colored marbles into separate bowls.

---

## Real-World Example

### Problem: Customer Segmentation for a Shopping Mall

A shopping mall has **10,000 customers.** They know each customer's:
- Annual income
- How much they spend per month
- How often they visit

The mall wants to send **different marketing** to different types of customers. But they don't know what types of customers they have!

### Solution: K-Means with K=3

K-Means looks at all 10,000 customers and groups them:

| Group | Name | Income | Spending | Visits/Month | Marketing Strategy |
|-------|------|--------|----------|--------------|-------------------|
| **Cluster 1** | Budget Shoppers | Rs 20K-40K | Rs 2K-5K | 2-3 times | Send **discount coupons** and sale alerts |
| **Cluster 2** | Premium Shoppers | Rs 80K-150K | Rs 15K-30K | 6-8 times | Send **exclusive offers** and VIP invites |
| **Cluster 3** | Sale Hunters | Rs 40K-80K | Rs 1K-3K (only during sales) | 1-2 times | Send **sale announcements** only |

Now instead of sending the same boring email to everyone, the mall sends **targeted marketing** to each group. Sales go up by 30%!

---

## How It Works (The Marble Analogy)

Imagine you have **100 mixed marbles** (red, blue, green) dumped on a table. You want to sort them into **3 bowls** (K=3).

### Step 1: Place 3 bowls randomly on the table
These bowls are called **centroids** — they're the starting "centers" of each group.

### Step 2: Each marble goes to its NEAREST bowl
- Red marble near Bowl 1? → Goes to Bowl 1
- Blue marble near Bowl 3? → Goes to Bowl 3
- Every marble picks the closest bowl

### Step 3: Move each bowl to the center of its marbles
Bowl 1 has mostly red marbles → Move Bowl 1 to the middle of the red area.

### Step 4: Repeat Steps 2-3
- Some marbles switch bowls (they're now closer to a different bowl)
- Bowls move again to the new center
- Keep repeating until **nothing changes**

### Step 5: Done!
- Bowl 1 = All red marbles (Budget Shoppers)
- Bowl 2 = All blue marbles (Premium Shoppers)
- Bowl 3 = All green marbles (Sale Hunters)

```
BEFORE K-Means:                    AFTER K-Means:
All mixed up!                      Sorted into 3 groups!

  🔴 🔵 🟢 🔴                      Bowl 1: 🔴🔴🔴🔴🔴
  🟢 🔴 🔵 🟢                      Bowl 2: 🔵🔵🔵🔵
  🔵 🟢 🔴 🔵                      Bowl 3: 🟢🟢🟢🟢🟢
  🔴 🔵 🟢 🔴
```

---

## When to Use K-Means

- **You know roughly how many groups you want** — "I think there are 3-5 types of customers"
- **Your data is numeric** — numbers like income, age, spending (not text)
- **Groups are roughly round/spherical** — the groups are blob-shaped, not weird shapes
- **You want something fast and simple** — K-Means is one of the fastest clustering algorithms
- **Customer segmentation** — group customers by behavior
- **Image compression** — reduce number of colors in an image

## When NOT to Use K-Means

- **You have NO idea how many groups exist** — K-Means REQUIRES you to choose K. Use DBSCAN instead.
- **Your data has weird-shaped groups** — like a crescent moon shape. K-Means only finds round blobs.
- **You have lots of outliers/noise** — K-Means gets confused by outliers. They pull the centroids toward them.
- **Your groups are very different sizes** — K-Means tends to make groups of similar size, even if the real groups aren't.

---

## ExamGuard AI Connection

### How K-Means Helps ExamGuard

In an exam hall with 100 students, K-Means can **group students by behavior patterns:**

| Cluster | Behavior Type | Students | Action |
|---------|--------------|----------|--------|
| **Cluster 1** | "Normal writers" — head down, writing steadily | 75 students | No action needed |
| **Cluster 2** | "Head scratchers" — looking up often, fidgeting | 15 students | Monitor casually (probably just thinking) |
| **Cluster 3** | "Constant lookers" — frequently looking at neighbors | 8 students | Watch closely — potential cheating |
| **Cluster 4** | "Phone checkers" — hands under desk, glancing down | 2 students | HIGH ALERT — likely using phone |

**Without K-Means:** Invigilator has to watch all 100 students equally.
**With K-Means:** AI says "Focus on these 10 students in Clusters 3 and 4."

### Setting K for ExamGuard
- Start with K=4 (Normal, Slightly Unusual, Suspicious, Highly Suspicious)
- Can test K=3 to K=6 and see which gives the most useful grouping
- Use the **Elbow Method** (Google: "elbow method K-Means") to find the best K

---

## Key Terms

| Term | Meaning | Example |
|------|---------|---------|
| **K** | The number of groups you want | K=3 means sort into 3 groups |
| **Centroid** | The center point of a cluster | The "average customer" in each group |
| **Cluster** | A group of similar data points | All "Budget Shoppers" = one cluster |
| **Iteration** | One round of "assign to nearest → move centroid" | Usually takes 10-20 iterations to finish |
| **Elbow Method** | A trick to find the best K | Plot error for K=1,2,3,4,5... pick where the "elbow" bends |
| **Convergence** | When centroids stop moving — algorithm is done | Nothing changes = we found our groups |

---

## Quick Summary

```
K-Means in one line:
"Pick K bowls, put each marble in the nearest bowl, move bowls to center, repeat."

Input:  10,000 customers (no labels)
Output: 3 groups — Budget, Premium, Sale Hunter

You choose: K (number of groups)
It finds:   Which data point belongs to which group
```
