
const {use, expect} = require('chai');
const {MockProvider, solidity, loadFixture} = require('ethereum-waffle');
const {deploy, encodeFunctionType} = require("../deploy.js");
const ethers = require("ethers");

use(solidity);

const machine = process.env.MACHINE || "Machine.template.sol";

const fixture = async (provider, [wallet]) => {
  const contracts = await deploy(wallet, "temp/" + machine)();
  return contracts;
}

describe('EMO', function () {

  this.timeout(5000);

  it('Can call ask with bytes24', async () => {
    const [machine, merkle, oracle, court] = await loadFixture(fixture);

    const askTx = await oracle.ask(
      machine.gen.genSeed(),
      5,
      encodeFunctionType("0x333333333333333333333333333333333333333333333333"),
      encodeFunctionType("0x333333333333333333333333333333333333333333333333"),
    );
    await askTx.wait();

    expect('ask').to.be.calledOnContract(oracle);
  });

  it('Can call ask with address and selector', async () => {
    const [machine, merkle, oracle, court] = await loadFixture(fixture);
        
    const askTx = await oracle.ask(
      machine.gen.genSeed(),
      5,
      encodeFunctionType("0x3333333333333333333333333333333333333333", "0x33333333"),
      encodeFunctionType("0x3333333333333333333333333333333333333333", "0x33333333"),
    );
    await askTx.wait();

    expect('ask').to.be.calledOnContract(oracle);
  });

  it('Can call ask with contract', async () => {
    const [machine, merkle, oracle, court] = await loadFixture(fixture);
        
    const askTx = await oracle.ask(
      machine.gen.genSeed(),
      5,
      encodeFunctionType(oracle, "ask"),
      encodeFunctionType(oracle, "answer"),
    );
    await askTx.wait();

    expect('ask').to.be.calledOnContract(oracle);
  });
  
});
