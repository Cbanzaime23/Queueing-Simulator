
# M/M/s Queue Simulator Pro v3.7

A rigorous, interactive, and visually rich web application for simulating and analyzing queueing systems. This tool bridges the gap between theoretical queueing models (M/M/s, G/G/s, etc.) and real-time stochastic discrete-event simulation.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18.2-61DAFB.svg?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.0-38B2AC.svg?logo=tailwind-css)

## 🌟 Key Features

### 1. Advanced Queueing Models
Support for standard Kendall's Notation models with configurable parameters:
*   **M/M/1**: Single server, exponential inter-arrival and service times.
*   **M/M/s**: Multiple servers with infinite queue capacity.
*   **M/M/$\infty$**: Infinite server model (self-service).
*   **M/M/s/K**: Finite system capacity (blocking/loss system).
*   **M/M/s//N**: Finite calling population (Machine Repair model).

### 2. Flexible Distribution Engine
Go beyond simple Markovian models. Configure Arrival and Service processes independently:
*   **Poisson (Exponential)**: The standard memoryless assumption.
*   **Deterministic**: Fixed, constant time intervals (zero variance).
*   **Uniform**: Bounded variance within a specified range.
*   **Erlang-$k$**: Tunable shape parameter ($k$) to model multi-stage processes (reduces variance compared to Exponential).

### 3. Dual-Engine Validation
The app runs two parallel engines to validate results:
1.  **Theoretical Engine**:
    *   Uses exact Erlang-C / Erlang-B formulas for Markovian systems.
    *   Uses **Sakasegawa’s Approximation** ($L_q \approx \frac{\rho^{\sqrt{2(s+1)}}}{1-\rho} \cdot \frac{C_a^2 + C_s^2}{2}$) for general G/G/s systems.
2.  **Simulation Engine**:
    *   Real-time discrete-event simulation (DES).
    *   Tracks individual entities (Customers/Servers).
    *   Calculates statistical accumulators for Wait Time ($W_q$), Queue Length ($L_q$), and Utilization ($\rho$).

### 4. Advanced Simulation Mechanics
*   **Dynamic Staffing**: Configure hourly schedules for arrivals $\lambda(t)$ and staff count $s(t)$ to simulate lunch rushes or shift changes.
*   **Skill-Based Routing**: Route customers (Sales, Tech, Support) to agents with matching skills.
*   **Retrial / Orbit**: Simulate call centers where blocked customers enter an "Orbit" and retry after a delay.
*   **Breakdowns & Panic Mode**: Introduce random server failures (MTBF/MTTR) or trigger "Panic Mode" (increased efficiency) when queues get too long.
*   **Batch Processing**: Support for Bulk Arrivals and Batch Service logic.

### 5. High-Fidelity Visualization & Navigation
*   **3D Agent Intelligence**: Customers use steering behaviors (Boids-like separation) to realistically navigate around obstacles and other customers.
*   **Interactive 2D View**: Pan, Zoom, and Center the view to manage large-scale simulations with many servers.
*   **Dynamic Mood System**: Customers change color (Green $\to$ Red) and shake with anger as they wait longer than their patience threshold.
*   **Floating Reaction System**: Visual emojis pop up for discrete events like VIP Arrivals (👑), Reneging (😡), Breakdowns (⚠️), and Retrials (🔄).

### 6. Network & Data Lab
*   **Jackson Network Builder**: Design multi-stage stochastic networks with probabilistic routing and blocking.
*   **Data Lab**: Upload CSV logs to analyze historical data distributions and run trace-driven simulations.

### 7. Reporting & Documentation
*   **Excel Export**: Download detailed `.xlsx` reports containing summary statistics and granular customer logs (including **queue length at arrival**, wait times, and service metrics).
*   **Dynamic Documentation**: The app automatically generates an "Assumptions & Scope" section based on the active configuration, helping users understand model limitations (e.g., instability warnings, approximation notes).

## 🛠 Technical Stack

*   **Frontend Framework**: React 18
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS
*   **Charting**: Recharts
*   **3D Rendering**: React Three Fiber (Three.js)
*   **Exports**: SheetJS (xlsx)

## 🧮 Theoretical Background

The simulator validates stochastic behavior against standard queueing theory results.

### Stability Condition
For a system to reach steady state, the traffic intensity $\rho$ must satisfy:
$$ \rho = \frac{\lambda}{s \mu} < 1 $$

### Sakasegawa's Approximation (G/G/s)
When non-Poisson distributions are selected, the app automatically switches theoretical benchmarks to this approximation, which accounts for the Coefficient of Variation of arrivals ($C_a$) and service ($C_s$):
$$ E[L_q]_{G/G/s} \approx E[L_q]_{M/M/s} \cdot \frac{C_a^2 + C_s^2}{2} $$

## 🚀 Getting Started

1.  **Clone the repository**
2.  **Install dependencies**: `npm install`
3.  **Run the development server**: `npm run dev`

## 📖 Usage Guide

1.  **Select Model**: Choose between M/M/1, M/M/s, etc.
2.  **Configure Processes**:
    *   Adjust **Arrival Rate ($\lambda$)** and distribution type.
    *   Adjust **Service Time ($1/\mu$)** and distribution type.
    *   If using **Erlang**, adjust the $k$ parameter to control variance (higher $k$ = less variance).
3.  **Control Simulation**:
    *   Use the **Play/Pause** button to stop time.
    *   Adjust **Speed** slider to fast-forward simulation.
    *   Hit **Reset** to clear statistics and start over.
4.  **Analyze & Export**:
    *   Check the "Model Configuration" card for auto-generated assumptions.
    *   Watch the graphs to see convergence.
    *   Click **Export** to download the simulation dataset for external analysis in Excel.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.
