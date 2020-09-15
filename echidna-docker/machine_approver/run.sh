#!/bin/bash
machinePath=$1
result=$(node basic_checker.js $machinePath)
echo "$result"
if [[ $result = "Your file passed basic checker." ]]
 then
   echo "Echidna starts fuzzing, please wait."
   cd ./echidna
   echidna-test Test.sol --contract Test --config config.yaml
   echo "The fuzzing finished."
fi
