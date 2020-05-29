const {deployContract, link} = require('ethereum-waffle');

const Machine = require('./build/Machine.json');
const Merkle = require('./build/Merkle.json');
const Oracle = require('./build/Oracle.json');
const Court = require('./build/Court.json');

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
  return [machine, merkle, oracle, court];
}

module.exports = deploy;
