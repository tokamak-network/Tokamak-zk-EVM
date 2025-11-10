# Synthesizer Class Refactoring Plan

## Overview

The current `Synthesizer` class violates the Single Responsibility Principle (SRP). This document outlines current issues and provides a comprehensive refactoring strategy.

## Current Issues Analysis

### 1. SRP Violations

The `Synthesizer` class currently handles multiple responsibilities:

1. **Circuit Placement Management**

   - `placeEcRecoverAuxInCircuit()`
   - `placeKeccakAuxInCircuit()`
   - `placeMptAuxInCircuit()`
   - `placeSignedAuxInCircuit()`
   - `placeUnsignedAuxInCircuit()`

2. **Data Loading**

   - `loadWireValues()`
   - `loadCircuitValues()`
   - `loadSingleLayerOpcode()`
   - `loadDoubleLayerOpcode()`

3. **Memory Management**

   - `calculateMemoryInStack()`
   - `addMemoryInStack()`
   - `addMemoryFromStack()`
   - `addMemoryFromStackToAux()`

4. **Buffer Management**

   - `addBufferFromStack()`
   - `addSignedFromBuffer()`
   - `addUnsignedFromBuffer()`

5. **Auxiliary Input Management**
   - `addAuxiliaryInput()`
   - Maintaining main auxiliary input data structure

### 2. Class Size Issues

- Current class exceeds 1000 lines, making it very large
- Over 50 methods resulting in low cohesion
- Difficult to test and maintain

## Refactoring Plan

### Phase 1: Separation of Responsibilities

#### 1.1 CircuitManager Class Creation

```typescript
/**
 * Handles all circuit placement related logic
 */
class CircuitManager {
  private synthesizer: Synthesizer;

  constructor(synthesizer: Synthesizer) {
    this.synthesizer = synthesizer;
  }

  placeEcRecoverAuxInCircuit(/* ... */): void;
  placeKeccakAuxInCircuit(/* ... */): void;
  placeMptAuxInCircuit(/* ... */): void;
  placeSignedAuxInCircuit(/* ... */): void;
  placeUnsignedAuxInCircuit(/* ... */): void;
}
```

#### 1.2 DataLoader Class Creation

```typescript
/**
 * Handles wire values and circuit values loading
 */
class DataLoader {
  private synthesizer: Synthesizer;

  constructor(synthesizer: Synthesizer) {
    this.synthesizer = synthesizer;
  }

  loadWireValues(/* ... */): void;
  loadCircuitValues(/* ... */): void;
  loadSingleLayerOpcode(/* ... */): void;
  loadDoubleLayerOpcode(/* ... */): void;
}
```

#### 1.3 MemoryManager Class Creation

```typescript
/**
 * Handles memory and stack related operations
 */
class MemoryManager {
  private synthesizer: Synthesizer;

  constructor(synthesizer: Synthesizer) {
    this.synthesizer = synthesizer;
  }

  calculateMemoryInStack(/* ... */): bigint;
  addMemoryInStack(/* ... */): void;
  addMemoryFromStack(/* ... */): void;
  addMemoryFromStackToAux(/* ... */): void;
}
```

#### 1.4 BufferManager Class Creation

```typescript
/**
 * Handles buffer related operations
 */
class BufferManager {
  private synthesizer: Synthesizer;

  constructor(synthesizer: Synthesizer) {
    this.synthesizer = synthesizer;
  }

  addBufferFromStack(/* ... */): void;
  addSignedFromBuffer(/* ... */): void;
  addUnsignedFromBuffer(/* ... */): void;
}
```

### Phase 2: Synthesizer Class Restructuring

#### 2.1 Core Responsibility Focus

```typescript
/**
 * Refactored Synthesizer class
 * Focuses on auxiliary input management and coordination of other managers
 */
class Synthesizer {
  private _circuits: CircuitManager;
  private _data: DataLoader;
  private _memory: MemoryManager;
  private _buffers: BufferManager;

  // Accessors for each manager
  get circuits(): CircuitManager {
    return this._circuits;
  }
  get data(): DataLoader {
    return this._data;
  }
  get memory(): MemoryManager {
    return this._memory;
  }
  get buffers(): BufferManager {
    return this._buffers;
  }

  constructor(/* ... */) {
    // Initialize managers
    this._circuits = new CircuitManager(this);
    this._data = new DataLoader(this);
    this._memory = new MemoryManager(this);
    this._buffers = new BufferManager(this);
  }

  // Core responsibility: auxiliary input management
  addAuxiliaryInput(/* ... */): void;

  // Backward compatibility delegation methods (deprecated)
  /** @deprecated Use synthesizer.circuits.placeEcRecoverAuxInCircuit() instead */
  placeEcRecoverAuxInCircuit(/* ... */): void {
    return this._circuits.placeEcRecoverAuxInCircuit(/* ... */);
  }

  // ... other deprecated delegation methods
}
```

### Phase 3: Usage Pattern Changes

#### 3.1 Current Usage

```typescript
synthesizer.placeEcRecoverAuxInCircuit(/* ... */);
synthesizer.loadWireValues(/* ... */);
synthesizer.calculateMemoryInStack(/* ... */);
synthesizer.addBufferFromStack(/* ... */);
```

#### 3.2 New Usage

```typescript
synthesizer.circuits.placeEcRecoverAuxInCircuit(/* ... */);
synthesizer.data.loadWireValues(/* ... */);
synthesizer.memory.calculateMemoryInStack(/* ... */);
synthesizer.buffers.addBufferFromStack(/* ... */);
```

## Migration Strategy

### Step 1: Create New Classes

- Create CircuitManager, DataLoader, MemoryManager, BufferManager classes
- Move existing methods to appropriate classes

### Step 2: Modify Synthesizer Class

- Add new managers as properties
- Convert existing methods to delegation methods and mark as deprecated

### Step 3: Gradual Migration

- Encourage use of new API
- Maintain backward compatibility for existing code
- Update test cases

### Step 4: Final Cleanup

- Remove deprecated methods after sufficient migration period
- Update documentation

## Expected Benefits

### 1. Code Quality Improvement

- **Single Responsibility Principle Compliance**: Each class has one clear responsibility
- **Increased Cohesion**: Related functions are grouped in the same class
- **Reduced Coupling**: Clear dependencies between classes

### 2. Maintainability Enhancement

- **Testability**: Each manager can be tested independently
- **Extensibility**: New features affect only the appropriate manager
- **Debugging**: Easy to identify problematic areas

### 3. Development Efficiency Improvement

- **Code Navigation**: Easy to find related functionality in IDE
- **Team Collaboration**: Developers can focus on specific managers
- **Code Review**: Smaller units for review

## Considerations

1. **Backward Compatibility**: Keep existing API deprecated but functional for a period
2. **Gradual Implementation**: Apply changes step by step, not all at once
3. **Test Coverage**: Ensure functionality is not broken during refactoring
4. **Documentation**: Write documentation for new API usage

## Next Steps

1. Team review and approval of refactoring plan
2. Detailed implementation planning
3. Test case creation
4. Step-by-step implementation
