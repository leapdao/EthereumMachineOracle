const echidna_result = process.argv[2];
const result = JSON.parse(echidna_result);
// We have 5 keys: [ 'gas_info', 'seed', 'tests', 'error', 'success', 'coverage' ]
// Have no idea when error will not be null and success will be false - skip for now
// tests is an array of objects that in our case contains tested properties like this
/*
{ status: 'passed',
       transactions: null,
       error: null,
       name: 'echidna_imageHash_main',
       contract: '',
       type: 'property' }
*/
const tests = result.tests;
// status can be 'fuzzing', 'shrinking', 'solved', 'passed', 'error'
// have no idea when it become 'fuzzing' and 'error' - skip for now
// 'shrinking' - when echidna finds a call sequence (transactions key represents) that violate the property
/*
{"status":"shrinking",
"transactions":[{"function":"airdrop","gas":8000030,"gasprice":5799997347,"arguments":[],"contract":""},{"function":"backdoor","gas":8000030,"gasprice":19151604241,"arguments":[],"contract":""}],
"error":null,
"name":"echidna_balance_under_1000",
"contract":"",
"type":"property"}
*/
// 'solved' - when something is wrong in a property itself (in our case with state generation or implementation of a functions of Machine lib)
// 'passed' - everything is fine

const notPassed = tests.filter(testedProperty => testedProperty.status != 'passed');

if (notPassed.length === 0) {
  console.log("This Machine implementation is approved to be used in EMO.");
  process.exit();
}
const handledNotPassed = notPassed.filter(testedProperty => testedProperty.status === 'shrinking' || testedProperty.status === 'solved');

console.log("This Machine implementation is not approved to be used in EMO. Please, look at the properties that Machine must satisfy https://hackmd.io/DXVvXgFKRQae8Sy3ncrJ3g?view#The-Machine");

if (notPassed.length != handledNotPassed.length) {
  console.log("Your case doesn't handle by analyzer, please open an isuue here https://github.com/leapdao/EthereumMachineOracle/issues");
  process.exit();
}

const isDark = notPassed.filter(testedProperty => testedProperty.name === 'echidna_terminal_isDark');
const generateState = notPassed.filter(testedProperty => testedProperty.name === 'echidna_generateState');
const image = notPassed.filter(testedProperty => testedProperty.name === 'echidna_imageHash_main');
const noninterference = notPassed.filter(testedProperty => testedProperty.name === 'echidna_noninterference_main');
const terminal = notPassed.filter(testedProperty => testedProperty.name === 'echidna_terminal_main');

if (isDark.length === 0) {
  if (terminal.length != 0) {
    switch (terminal[0].status) {
      case 'shrinking':
        console.log("The following call sequence violate the Machine property if state is terminal the next state must be the same:");
        for (let i = 0; i < terminal[0].transactions.length; i++) {
          console.log("Function: " + terminal[0].transactions[i].function + " with arguments: " + terminal[0].transactions[i].arguments);
        }
        break;
      case 'solved':
        console.log("The Machine implementation doesn't satisfy the property if state is terminal the next state must be the same. Please, take a look, on how the 'next', 'isTerminal', 'stateHash' functions and 'State struct' are implemented.");
        break;
    }
  }
} else {
  switch (isDark[0].status) {
    case 'shrinking':
      console.log("The way how the terminal state (third output) is generated is vulnerable, because the state is not terminal in the following call sequence:");
      for (let i = 0; i < isDark[0].transactions.length; i++) {
        console.log("Function: " + isDark[0].transactions[i].function + " with arguments: " + isDark[0].transactions[i].arguments);
      }
      break;
    case 'solved':
      console.log("The way how the terminal state (third output) is generated is wrong. Please, take a look, on how you generate terminal state or how the 'next' function is implemented.");
      break;
  }
}

if (generateState.length === 0) {
  if (image.length != 0) {
    switch (image[0].status) {
      case 'shrinking':
        console.log("The following call sequence violate the Machine property if two states are the same the images must be the same:");
        for (let i = 0; i < image[0].transactions.length; i++) {
          console.log("Function: " + image[0].transactions[i].function + " with arguments: " + image[0].transactions[i].arguments);
        }
        break;
      case 'solved':
        console.log("The Machine implementation doesn't satisfy the property if two states are the same the images must be the same. Please, take a look, on how the 'imageHash', 'project', 'stateHash' functions and 'State struct, Image struct' are implemented.");
        break;
    }
  }
} else {
  switch (generateState[0].status) {
    case 'shrinking':
      console.log("The way how first two states are generated is vulnerable, because the stateHashes doesn't match in the following call sequence:");
      for (let i = 0; i < generateState[0].transactions.length; i++) {
        console.log("Function: " + generateState[0].transactions[i].function + " with arguments: " + generateState[0].transactions[i].arguments);
      }
      break;
    case 'solved':
      console.log("The way how first two states are generated is wrong, because the stateHashes doesn't match. Please, take a look, on how you generate states or how stateHash function is implemented, or State struct.");
      break;
  }
}

if (noninterference.length != 0) {
  switch (noninterference[0].status) {
    case 'shrinking':
      console.log("The following call sequence violate the Machine property noninterference:");
      for (let i = 0; i < noninterference[0].transactions.length; i++) {
        console.log("Function: " + noninterference[0].transactions[i].function + " with arguments: " + noninterference[0].transactions[i].arguments);
      }
      break;
    case 'solved':
      console.log("The Machine implementation doesn't satisfy the property noninterference. Please, take a look, on how 'stateHash', 'next' functions are implemented, or State struct.");
      break;
  }
}
