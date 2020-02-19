#! /bin/bash

# Compiles with template
solc src/Oracle.sol
# Compiles with example implementation
sed 's|Machine.template.sol|./src/ExampleMachine.sol|' src/Oracle.sol | solc -
