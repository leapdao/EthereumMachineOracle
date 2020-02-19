# Ethereum Machine Oracle

This project is a set of smart contracts for Ethereum, capable of verifying large computations off chain.

It aims to be generic, capable of verifying computations done on any abstract machine implementing a specified [interface](./src/Machine.template.sol), using the [truebit](https://people.cs.uchicago.edu/~teutsch/papers/truebit.pdf) style verification game. 

This is a spiritual successor to [solEVM enforcer](https://github.com/leapdao/solEVM-enforcer).

## Developer guide

### Requirements

You have to have the [solidity command line compiler](https://solidity.readthedocs.io/en/v0.6.2/installing-solidity.html#binary-packages) (version >= 0.6.0) installed on your machine.

### Compilation

To typecheck run:

```./typecheck.sh```

## The internal model and terminology

In this section we will explain the terminology used in the code and further documentation. 

### Machine

The word _machine_ is used to refer to any deterministic state machine that implements a specified [interface](./src/Machine.template.sol).

Each _machine_ is defined by 3 types: _State_, _Seed_ and _Image_, and 6 functions: _create_, _project_, _isTerminal_, _next_, _stateHash_ and _imageHash_.

_State_ describes the state of the machine at a particular moment of execution.

The function _next_ performs the smallest possible step of computation, mapping the input _State_ into an output _State_, **or failing** (all of the situations in which it fails will be described later).

The function _isTerminal_ determines if a given _State_ is terminal, meaning that if _isTerminal(s) == true_, where _s_ is of type _State_, then _next(s)_ must either fail or return _s_ unchanged. 

The function _stateHash_ maps a _State_ to _bytes32_, giving a "fingerprint" to every _State_. The following has to hold for any valid _machine_ implementation: 

Let _s1_ and _s2_ be of type _State_. If _stateHash(s1) == stateHash(s2)_, then _stateHash(next(s1)) == stateHash(next(s2))_ (assuming here neither _next_ fails).

Every value of type _Seed_ uniquely determines a _State_ through the function _create_. _Seed_ can be thought of as the initial parameters to a computation. For example, if the _machine_ in question is something like the [EVM](https://ethereum.github.io/yellowpaper/paper.pdf), it's _Seed_ would be a combination of a function, the parameters to it, and the state of the blockchain (i.e. the execution environment). In the EVM example, the _State_ created with _create_ from such a _Seed_, would include all of the _Seed_ data, but also an empty memory, the program counter set to 0 etc.

The type _Image_ represents the part of _State_ we care about when the computation is finished. Usually when running a compuation, one is not interested in the entire state of the machine running it, but only in some part of it. The function _project_ extracts this part (the _Image_) from a given _State_. We can also take a fingerprint of an _Image_ using the function _imageHash_. The following has to hold for any valid _machine_ implementation:

Let _s1_ and _s2_ be of type _State_. If _stateHash(s1) == stateHash(s2)_, then _imageHash(project(s1)) == imageHash(project(s2))_.

#### Example implementation

Let's take a look at an example _machine_ [implementation](./src/ExampleMachine.sol). This machine is initialized with an array of numbers (the Seed). It's job is to add these numbers together. It does so by putting the initial numbers onto a stack, and keeping a running sum (together these form the State). At each step the top element of the stack is added to the running sum. The part of the State interesting to us is the sum, so the function project just gives us the sum (the Image) in any given State.

### Oracle

Coming soon.

### Court

Coming soon.

## Incentives

Coming soon.
