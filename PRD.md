# Product Requirements Document (PRD): QueuePro SAAS
## Educational & Industrial Queueing Simulation Platform

**Version:** 4.0 (SAAS Migration)  
**Status:** In Development  

---

## 1. Executive Summary
QueuePro is a professional-grade SAAS platform for Operations Research and Industrial Engineering. It provides high-fidelity discrete event simulation (DES) to optimize service systems.

## 2. Business Logic & Tiers

### 2.1. Free Tier (The Student)
* **Access:** Single Node Simulation only.
* **Constraints:** Max 5 servers, 2D visualization only.
* **Data:** Local session save only.
* **Goal:** Educational tool for basic queueing theory (M/M/s).

### 2.2. Premium Tier (The Engineer)
* **Access:** Full Platform (Network Builder + Data Lab).
* **Constraints:** Unlimited nodes/servers.
* **Visualization:** High-performance 3D Scene + 2D Zoom/Pan.
* **Cloud:** Save/Load projects to user account.
* **Industrial Tools:** Sakasegawa approximations, Jackson Network solver, Excel/CSV Batch exports.

## 3. Technical Architecture

### 3.1. Frontend (Vibe Driven)
* **Framework:** React 18 / Vite.
* **State:** Simulation Engine (Local for visuals, Backend for batch).
* **Visuals:** Three.js (3D) and Canvas-physics (2D).

### 3.2. Backend (Scale)
* **API:** Node.js + Express on Google Cloud Run.
* **Auth:** Firebase Authentication.
* **Billing:** Stripe Subscription API.
* **DB:** Google Cloud SQL (PostgreSQL).

## 4. Production Features Required
* **User Dashboard:** Manage saved simulation projects.
* **Export Engine:** Generate professional process optimization reports (PDF/XLSX).
* **Real-time Headless Worker:** Compute heavy stochastic models in the background.

## 5. Security & Scaling
* **Data Privacy:** User data encrypted at rest in Cloud SQL.
* **Scaling:** Cloud Run scales to zero during off-peak and handles thousands of concurrent simulations.
