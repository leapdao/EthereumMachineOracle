const {MockProvider, getWallets, deployContract, link} = require('ethereum-waffle');

const Machine = require('./build/Machine.json');
const Oracle = require('./build/Oracle.json');

const deploy = (wallet) => async () => {
  const machine = await deployContract(
    wallet,
    Machine,
    [],
  );
  link(Oracle, 'src/Machine.template.sol:Machine', machine.address);
  const oracle = await deployContract(
    wallet,
    Oracle,
    []
  );
  return [machine, oracle];
}

const run = async () => {
  const provider = new MockProvider();
  const [wallet] = provider.getWallets();
  const [machine, oracle] = await deploy(wallet)();
  console.log(machine);
  console.log(oracle);
}

run();
