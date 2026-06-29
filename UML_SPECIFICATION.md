# QueuePro UML Specification v4.0

This document provides a technical blueprint of the QueuePro SAAS application using Unified Modelling Language (UML) standards, represented via Mermaid.js.

## 1. System Architecture (Component Diagram)
QueuePro follows a decoupled architecture where the mathematical simulation engines are independent of the React rendering layer.

```mermaid
componentDiagram
    [User Browser] <<Frontend>> as UI
    [SimulationEngine] <<Logic>> as SE
    [NetworkEngine] <<Logic>> as NE
    [MathUtils] <<Utility>> as MU
    [useSimulation Hook] <<State Bridge>> as Hook

    UI --> Hook
    Hook --> SE
    UI --> NE
    SE ..> MU : uses
    NE ..> MU : uses
    
    UI --> [Recharts] : Data Viz
    UI --> [Three.js] : 3D Scene
    UI --> [Canvas Physics] : 2D Scene
```

## 2. Core Logic (Class Diagram)
The primary intelligence of the system resides in the `SimulationEngine` (for single-node high-fidelity modelling) and `NetworkEngine` (for multi-node Jackson networks).

```mermaid
classDiagram
    class SimulationEngine {
        -SimulationState state
        -SimulationConfig config
        -number nextArrivalTime
        +tick(deltaTimeMinutes)
        +updateConfig(newConfig)
        +reset()
        -handleArrival(time)
        -assignServers()
        -handleDepartures(time)
        -recordHistorySnapshot()
    }

    class NetworkEngine {
        -NetworkNode[] nodes
        -NetworkLink[] links
        -ResourcePool[] resourcePools
        +tick(dt)
        +getState()
        -routeCustomer(customer, sourceNode)
        -handleArrival(node, time)
    }

    class Customer {
        +string id
        +number arrivalTime
        +number serviceTime
        +number priority
        +SkillType requiredSkill
        +number? patienceTime
    }

    class Server {
        +number id
        +ServerState state
        +SkillType[] skills
        +number efficiency
        +Customer[] queue
        +Customer[] _activeBatch
    }

    SimulationEngine "1" *-- "many" Customer : manages
    SimulationEngine "1" *-- "many" Server : manages
    NetworkEngine "1" *-- "many" NetworkNode : manages
```

## 3. Server Lifecycle (State Machine Diagram)
Servers transition between states based on customer availability and random breakdown events.

```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> BUSY : Customer Assigned
    BUSY --> IDLE : Service Complete
    
    IDLE --> OFFLINE : MTBF Triggered (Breakdown)
    BUSY --> OFFLINE : MTBF Triggered (Breakdown)
    
    OFFLINE --> IDLE : MTTR Complete (Repair)
    OFFLINE --> BUSY : Repair Complete (Preemptive Resume)
```

## 4. Customer Journey (Sequence Diagram)
This diagram illustrates the flow of events from arrival to departure in a single-node system.

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant Q as Queue
    participant E as Engine
    participant Ag as Agent (Server)
    participant C as Customer

    S->>E: Tick(dt)
    E->>E: Check Arrival Time
    alt Is Arrival Time?
        E->>C: Instantiate Customer
        E->>Q: Push to Queue
        E->>S: Schedule Next Arrival (nextDistribution)
    end
    
    E->>Ag: Find IDLE Server
    alt Server Available?
        Q->>E: Pop FIFO/Priority
        E->>Ag: Assign Customer
        Ag->>Ag: Set State to BUSY
        Ag->>Ag: Calc finishTime (serviceTime / efficiency)
    end

    alt CurrentTime >= finishTime
        Ag->>E: Complete Transaction
        E->>C: Mark Departed
        Ag->>Ag: Set State to IDLE
        E->>E: Record History Snapshot
    end
```

## 5. Data Flow (Project Schema)
Key interfaces used for state persistence and SAAS cloud synchronization.

```mermaid
erDiagram
    USER ||--o{ PROJECT : owns
    PROJECT ||--o{ NODE_CONFIG : contains
    PROJECT ||--o{ LINK_CONFIG : contains
    
    PROJECT {
        string id
        string name
        timestamp lastModified
        string tier "Free | Premium"
    }
    
    NODE_CONFIG {
        float x
        float y
        int serverCount
        float avgServiceTime
    }
    
    LINK_CONFIG {
        string sourceId
        string targetId
        float probability
    }
```
