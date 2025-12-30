# M/M/s Queue Simulator Pro

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
*   **M/M/∞**: Infinite server model (self-service).
*   **M/M/s/K**: Finite system capacity (blocking/loss system).

### 2. Flexible Distribution Engine
Go beyond simple Markovian models. Configure Arrival and Service processes independently:
*   **Poisson (Exponential)**: The standard memoryless assumption.
*   **Deterministic**: Fixed, constant time intervals (zero variance).
*   **Uniform**: Bounded variance within a specified range.
*   **Erlang-k**: Tunable shape parameter ($k$) to model multi-stage processes (reduces variance compared to Exponential).

### 3. Dual-Engine Validation
The app runs two parallel engines to validate results:
1.  **Theoretical Engine**:
    *   Uses exact Erlang-C / Erlang-B formulas for Markovian systems.
    *   Uses **Sakasegawa’s Approximation** ($L_q \approx \frac{\rho^{\sqrt{2(s+1)}}}{1-\rho} \cdot \frac{C_a^2 + C_s^2}{2}$) for general G/G/s systems.
2.  **Simulation Engine**:
    *   Real-time discrete-event simulation (DES).
    *   Tracks individual entities (Customers/Servers).
    *   Calculates statistical accumulators for Wait Time ($W_q$), Queue Length ($L_q$), and Utilization ($\rho$).

### 4. High-Fidelity Visualization
*   **Live "Bank" View**: Watch customers arrive, queue, and get served by animated tellers in real-time.
*   **Time-Series Charts**: Compare observed simulation metrics against theoretical steady-state targets dynamically.
*   **Little's Law Check**: visually verify $L = \lambda W$ stability.

## 🛠 Technical Stack

*   **Frontend Framework**: React 18
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS
*   **Charting**: Recharts
*   **Icons**: FontAwesome 6
*   **Build Tool**: Vite (implied environment)

## 🧮 Theoretical Background

The simulator validates stochastic behavior against standard queueing theory results.

### Stability Condition
For a system to reach steady state, the traffic intensity $\rho$ must satisfy:
$$ \rho = \frac{\lambda}{s \mu} < 1 $$

### Sakasegawa's Approximation (G/G/s)
When non-Poisson distributions are selected, the app automatically switches theoretical benchmarks to this approximation, which accounts for the Coefficient of Variation of arrivals ($C_a$) and service ($C_s$):
$$ E[L_q]_{G/G/s} \approx E[L_q]_{M/M/s} \cdot \frac{C_a^2 + C_s^2}{2} $$

*   **Deterministic**: $C^2 = 0$
*   **Erlang-k**: $C^2 = 1/k$
*   **Uniform**: $C^2 = 1/3$ (approx standardized)
*   **Exponential**: $C^2 = 1$

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
4.  **Analyze**:
    *   Check the "Model Documentation" card for validity notes.
    *   Watch the graphs to see if the green "Actual" line converges to the blue dashed "Theoretical" line.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.