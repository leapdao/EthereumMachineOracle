const {deployContract, link} = require('ethereum-waffle');
const {utils} = require('ethers');

const Machine = require('./build/Machine.json');
const Merkle = require('./build/Merkle.json');
const Oracle = require('./build/Oracle.json');
const Court = require('./build/Court.json');

const encodeFunctionType = (...args) => {
  const isBytes24 =
        args.length === 1 &&
        utils.isHexString(args[0]) &&
        utils.hexDataLength(args[0]) === 24;
  const isAddrAndSig =
        args.length === 2 &&
        utils.isHexString(args[0]) &&
        utils.hexDataLength(args[0]) === 20 &&
        utils.isHexString(args[1]) &&
        utils.hexDataLength(args[1]) === 4
  const isContractAndName =
        args.length === 2 &&
        args[0].constructor.name === "Contract" &&
        typeof args[1] === "string"

  if (isBytes24) {
    return args[0];
  } else if (isAddrAndSig) {
    return (args[0] + args[1].replace("0x",g ""));
  } else if (isContractAndName) {
    const contract = args[0];
    const functionName = args[1];

    if (!contract.functions.hasOwnProperty(functionName)) {
      throw new Error("The given contract does not have the function that was given!");
    }
    
    const funcFragment = contract.interface.fragments.reduce((acc, cv) => {
      if (cv.type === "function" && cv.name === functionName)
        return cv;
      else
        return acc;
    }, false);
    const funcSelector = contract.interface.getSighash(funcFragment);
    
    return (contract.address + funcSelector.replace("0x", ""));
  } else {
    throw new Error("Wrong argument types!");
  }
}

const pimpOracle = (oracle) => {
  
  oracle.interface._abiCoder._getCoder = function (param) {
    if (param.type === "function") {
      return this.__proto__._getCoder({...param, type: 'bytes24'});
    }
    return this.__proto__._getCoder(param);
  }
  
}

const deploy = (wallet) => async () => {
  const machine = await deployContract(
    wallet,
    Machine,
    [],
  );
  const merkle = await deployContract(
    wallet,
    Merkle,
    [],
  );
  link(Oracle, 'src/Machine.template.sol:Machine', machine.address);
  link(Court, 'src/Machine.template.sol:Machine', machine.address);
  link(Court, 'src/Merkle.sol:Merkle', merkle.address);
  const oracle = await deployContract(
    wallet,
    Oracle,
    []
  );
  const court = await deployContract(
    wallet,
    Court,
    []
  );

  pimpOracle(oracle);

  return [machine, merkle, oracle, court];
}

module.exports = {
  deploy,
  encodeFunctionType,
}
