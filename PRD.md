
# Product Requirements Document (PRD)
## M/M/s Queue Simulator Pro v3.6

**Date:** October 26, 2023  
**Status:** Live / Maintenance  
**Version:** 3.6  

---

## 1. Executive Summary
The **M/M/s Queue Simulator Pro** is a comprehensive web-based application designed to simulate, visualize, and analyze stochastic queueing systems. It bridges the gap between theoretical Operations Research (Kendall's Notation models) and real-world Discrete Event Simulation (DES). The tool allows users to model complex scenarios—from simple bank lines to multi-stage networks—providing both visual intuition via real-time animation and rigorous statistical validation.

## 2. Target Audience
*   **Students & Educators:** For teaching Operations Research, Industrial Engineering, and Computer Science (System Performance).
*   **Process Engineers:** For analyzing bottlenecks in manufacturing or service workflows.
*   **Service Managers:** For capacity planning in call centers, retail banks, and hospitals.
*   **System Architects:** For modeling server request handling and load balancing.

---

## 3. Product Scope & Modes

The application operates in three distinct modes:

### 3.1. Single Node Simulator (Core)
The primary interface for deeply analyzing a single service station (node) with complex internal logic.
*   **Focus:** Detailed internal mechanics (Shift schedules, psychology, breakdowns, skill routing).
*   **Visualization:** High-fidelity animated "floor plan" with individual customer agents.

### 3.2. Network Simulator (Jackson Networks)
A canvas-based builder for connecting multiple queueing nodes to form a network.
*   **Focus:** Interaction between nodes, routing logic, blocking, and shared global resources.
*   **Visualization:** Topological graph with flow indicators.

### 3.3. Data Lab
A utility for analyzing empirical data to drive simulations.
*   **Focus:** Distribution fitting and Trace-driven simulation.
*   **Visualization:** Histograms and statistical summaries.

---

## 4. Functional Requirements

### 4.1. Single Node Configuration
The user must be able to configure the following parameters:

#### 4.1.1. Structural Parameters
*   **Environment Presets:** Bank (Standard), Market (Dedicated Queues), Call Center (High Volume/Impatience).
*   **Queue Model:**
    *   **M/M/1**: Single Server.
    *   **M/M/s**: Multi-server.
    *   **M/M/$\infty$**: Infinite server (Self-service).
    *   **M/M/s/K**: Finite system capacity (Loss system).
*   **Resources:** Number of Servers ($s$), System Capacity ($K$).

#### 4.1.2. Stochastic Processes
*   **Arrival Process:**
    *   Distribution Types: Poisson (Exponential), Deterministic, Uniform, Erlang-$k$, Trace File.
    *   Parameters: Arrival Rate ($\lambda$), Shape ($k$).
    *   **Dynamic Schedule:** Hourly adjustment of $\lambda(t)$ via a graphical bar chart editor.
    *   **Bulk Arrivals:** Configurable group size (min/max).
*   **Service Process:**
    *   Distribution Types: Same as Arrival.
    *   Parameters: Service Rate ($\mu$), Shape ($k$).
    *   **Batch Service:** Server processes up to $N$ customers simultaneously.

#### 4.1.3. Advanced Logic
*   **Customer Psychology:**
    *   **Impatience:** Balking (refusing to join long lines) and Reneging (leaving after waiting).
    *   **Priorities:** VIP customers (jump to front) vs Standard.
*   **Server Logic:**
    *   **Heterogeneous Efficiency:** Mix of Senior (Fast) and Junior (Slow) staff.
    *   **Reliability:** Random Breakdowns defined by MTBF (Mean Time Between Failures) and MTTR (Mean Time To Repair).
    *   **State-Dependent Rates (Panic Mode):** Service speed increases when queue length exceeds a threshold.
    *   **Skill-Based Routing:** Servers have specific skills (Sales, Tech, Support); customers are routed to matching agents.
*   **Topology:**
    *   **Common Queue:** Single line (Bank style).
    *   **Dedicated Queues:** Individual line per server (Supermarket style) with **Jockeying** (switching lines).
*   **Retrials:** Blocked/Reneged customers enter an "Orbit" and retry after a delay.

### 4.2. Visualization (Single Node)
*   **Animation:**
    *   Customers represented as dots/icons moving from entry $\to$ queue $\to$ server $\to$ exit.
    *   **Mood System:** Customers change color (Green $\to$ Yellow $\to$ Red) and shake based on wait time vs. patience.
    *   **Event Popups:** Floating icons for events like "VIP Arrival", "Breakdown", "Renege".
*   **Real-Time Metrics:**
    *   Wait Time ($W_q$), Queue Length ($L_q$), Throughput, Service Level (SLA).
    *   Comparison of "Actual" (Simulated) vs "Theoretical" (Calculated) values.
*   **Charts:**
    *   **Convergence Graphs:** Live line charts showing $W_q$ and $L_q$ settling over time.
    *   **Gantt Chart:** Visual lifecycle bars for individual customers (Arrival, Wait, Service).
    *   **Scrubbing:** Hovering over charts allows replaying/viewing past states.

### 4.3. Network Simulation
*   **Canvas:** Drag-and-drop interface to place nodes.
*   **Node Config:** Each node has capacity, server count, service rate.
*   **Link Config:** Connect nodes with probabilistic routing (e.g., 20% go to Node B, 80% exit).
*   **Routing Strategies:**
    *   Probabilistic (Random Walk).
    *   **JSQ (Join Shortest Queue):** Load balancing to connected nodes.
*   **Shared Resources:** Define global resource pools (e.g., "Doctors") required by specific nodes to process customers.
*   **Blocking:** If a destination node is full, the customer is blocked at the source.

### 4.4. Analysis Tools
*   **Sensitivity Lab:** "What-if" analysis plotting Cost/Wait Time vs Server Count/Lambda.
*   **Scenario Manager:** Snapshot current simulation runs to overlay curves on charts for A/B testing.
*   **Export:** Download Simulation Logs (CSV) and Summary Stats.

---

## 5. Mathematical & Theoretical Validations

The system validates simulation results against standard queueing theory formulas where applicable:

1.  **Traffic Intensity:** $\rho = \frac{\lambda}{s \mu}$.
2.  **Little's Law:** $L = \lambda W$.
3.  **Exact Models:**
    *   Erlang-C for $M/M/s$.
    *   Erlang-B for $M/M/s/s$ (Loss systems).
    *   Pollaczek-Khinchine for $M/G/1$.
4.  **Approximations:**
    *   **Sakasegawa's Formula:** Used for $G/G/s$ systems to account for Coefficient of Variation ($C_a, C_s$).
    *   $$ L_q \approx \frac{\rho^{\sqrt{2(s+1)}}}{1-\rho} \cdot \frac{C_a^2 + C_s^2}{2} $$
5.  **Staffing Calculator:** Inverse Erlang-C to determine required staff for a given Service Level Target (e.g., 80% calls answered in 20s).

---

## 6. Technical Requirements

### 6.1. Tech Stack
*   **Framework:** React 18 (Functional Components, Hooks).
*   **Language:** TypeScript (Strict typing).
*   **Build System:** Vite (ESM).
*   **Styling:** Tailwind CSS (Utility-first).
*   **Visualization:** Recharts (Graphing), CSS Keyframes (Animation).

### 6.2. Performance
*   **Simulation Loop:** `requestAnimationFrame` based loop decoupled from React render cycle where possible (using Refs for engine state).
*   **State Management:** Local state for UI, Class-based `SimulationEngine` for logic to ensure performance during high-speed ticking.
*   **Responsiveness:** Mobile-responsive layout for controls and visualization canvas.

### 6.3. Data Compatibility
*   **Input:** CSV files for Trace mode (Format: `Arrival Time, Service Duration`).
*   **Output:** CSV export of customer logs.

---

## 7. User Interface Design

### 7.1. Header
*   Mode Switcher (Single / Network / Data Lab).
*   Global Controls: Play/Pause, Reset, Speed Slider.
*   Action Buttons: Snapshot, Export.

### 7.2. Single Node Layout
*   **Left Panel (Config):** Accordion/Card style inputs for Model, Arrivals, Services, and Advanced Scenarios.
*   **Center Panel (Visualizer):**
    *   **Metrics Row:** Cards for Wq, Lq, Utilization, Clock.
    *   **Animation Stage:**
        *   Left: Arrival/Entrance.
        *   Center: Service Floor (Server Cards showing status/skills).
        *   Bottom: Queue Visualization (Snake or Dedicated lines).
*   **Right/Bottom Panel (Charts):**
    *   Tabbed/Grid layout for Convergence Charts, Queue Dynamics, and Gantt Chart.
    *   Sensitivity Analysis Lab container.

### 7.3. Network Layout
*   **Canvas:** Infinite/Fixed area for nodes.
*   **Sidebar:** Node property editor, Global Resource pool manager.

---

## 8. Future Roadmap (Out of Scope for v3.6)
*   **Save/Load Config:** Persist complex network setups to LocalStorage or JSON file.
*   **3D Visualization:** Upgrade from 2D CSS animations to WebGL/Three.js.
*   **Heatmaps:** Spatial analysis of congestion in Network mode.
*   **Advanced Cost Models:** Time-dependent cost functions in Sensitivity Lab.
