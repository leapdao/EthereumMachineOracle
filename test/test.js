
const {use, expect} = require('chai');
const {MockProvider, solidity, loadFixture} = require('ethereum-waffle');
const {deploy, encodeFunctionType} = require("../deploy.js");
const ethers = require("ethers");

use(solidity);

const machine = process.env.MACHINE || "Machine.template.sol";
const clientDefaultTimeout = 6;

const fixture = async (provider, [wallet]) => {
  const contracts = await deploy(wallet, "temp/" + machine, clientDefaultTimeout)();
  return contracts;
}

const stake_size = ethers.BigNumber.from('0x16345785d8a0000');

// Helper functions.
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// Handle timing in a Oracle contract
async function handleOracleTiming(oracle, questionKey, timeoutCount = 1) {
  // Let time run, sleep a bit
  let question = await oracle.questions(questionKey);
  let askTime = Number(question[0] * 1000);
  let timeout = Number(question[1] * 1000);
  let now = Date.now();
  expect(now < askTime + timeout * timeoutCount, 'Now should be less than askTime + timeout.').to.be.true;
  let waitTime = askTime + timeout * timeoutCount - now;
  await sleep(waitTime);
}
// Block of helper functions for formatting structs to ethers Result (maybe we should have EMO utils)
const isEthersArray = (val) => {
  const keys = Object.keys(val);
  const nums = keys.filter(k => parseInt(k) === parseInt(k)).map(k => parseInt(k));
  return nums.length * 2 === keys.length && keys.length > 0;
}

const arraifyAsEthers = (obj) => {
  const arr = [];
  let i = 0;
  Object.keys(obj).forEach(key => {
      const ret = isEthersArray(obj[key]) ? arraifyAsEthers(obj[key]) : obj[key];
      arr[i.toString()] = ret;
      arr[key] = ret;
      i++;
  });
  turnAllToBigNum(arr);
  return arr;
}

const turnAllToBigNum = (obj) => {
  Object.keys(obj).forEach(key => {
    const ele = obj[key];
    if (typeof ele === 'object') {
      turnAllToBigNum(ele);
    } else if (parseInt(ele) === parseInt(ele)) {
      obj[key] = ethers.BigNumber.from(ele);
    }
  });
}


describe('EMO', function () {
  // Function checks that there is no question in Oracle storage before ask is called
  async function checkNoQuestionBeforeAsk(oracle, questionKey) {
    let question = await oracle.questions(questionKey);
    expect(question[0]).to.equal(0, "askTime should be default value.");
    expect(question[1]).to.equal(0, "timeout should be default value.");
    expect(question[2]).to.equal(0, "numberOfUnfalsifiedAnswers should be default value.");
    expect(question[3]).to.equal('0x000000000000000000000000000000000000000000000000', "successCallback should be default value.");
    expect(question[4]).to.equal('0x000000000000000000000000000000000000000000000000', "failCallback should be default value.");
  }
  // Function checks that new question is in Oracle storage
  async function checkNewQuestionInOracle(oracle, questionKey, defaultTimeout, successCallback, failCallback) {
    let question = await oracle.questions(questionKey);
    expect(question[1]).to.equal(defaultTimeout, "timeout should be defaultTimeout.");
    expect(question[2]).to.equal(0, "numberOfUnfalsifiedAnswers should be default value.");
    expect(question[3]).to.equal(successCallback.toLowerCase(), "successCallback should be client function.");
    expect(question[4]).to.equal(failCallback.toLowerCase(), "failCallback should be client function.");
  }
  // Function checks that question was deleted from Oracle storage
  async function checkQuestionWasDeleted(oracle, questionKey) {
    let res = await oracle.questions(questionKey);
    expect('questions').to.be.calledOnContractWith(oracle, [questionKey]);
    expect(res[0]).to.equal(0, 'askTime should be default value.');
    expect(res[1]).to.equal(0, 'timeout should be default value.');
    expect(res[2]).to.equal(0, "numberOfUnfalsifiedAnswers should be default value.");
    expect(res[3]).to.equal('0x000000000000000000000000000000000000000000000000', "successCallback should be default value.");
    expect(res[4]).to.equal('0x000000000000000000000000000000000000000000000000', "failCallback should be default value.");
  }
  //Due to EMOClient contract first and second call failCallback will retry to ask the question again
  async function attemptToResolveFailWithClientRetry(oracle, client, resolver, questionKey, seed, clientDefaultTimeout, successCallback, failCallback, askTime) {
    // Resolve with fail
    await expect(oracle.connect(resolver).resolveFail(questionKey))
      .to.emit(oracle, 'QuestionResolvedUnsuccessfully')
      .withArgs(questionKey)
      .to.emit(oracle, 'NewQuestion');
      //.withArgs(questionKey, arraifyAsEthers(seed), client.address);
    await checkNewQuestionEventsLogs(oracle, client, questionKey, seed);
    expect('failCallback').to.be.calledOnContractWith(client, [questionKey]);
    expect('ask').to.be.calledOnContractWith(oracle, [seed, clientDefaultTimeout, successCallback, failCallback]);
    // Check that new question appears in a Oracle contract storage with different askTime
    question = await oracle.questions(questionKey);
    let askTimeNew = question[0];
    expect(askTimeNew > askTime, "Should be new question with another askTime.").to.be.true;
    return askTimeNew;
  }
  // Function to check Answer was deleted from Oracle storage
  async function checkAnswerWasDeleted(oracle, imageHash) {
    let res = await oracle.getAnswer(imageHash);
    expect('getAnswer').to.be.calledOnContractWith(oracle, [imageHash]);
    expect(res[0]).to.equal("0x0000000000000000000000000000000000000000", 'Answerer should be deleted.');
    expect(res[1]).to.equal(0, 'Index in question member answerKeys array should be 0.');
    expect(res[2]).to.equal("0x0000000000000000000000000000000000000000000000000000000000000000", 'questionKey should be deleted.');
  }
  // Function to check NewQuestion events logs (temporary solution, waiting https://github.com/EthWorks/Waffle/issues/245)
  async function checkNewQuestionEventsLogs(oracle, client, questionKey, seed) {
    let newQuestionEvents = await oracle.queryFilter(oracle.filters.NewQuestion());
    for (let i = 0; i < newQuestionEvents.length; i++) {
      let eventArgs = newQuestionEvents[i].args;
      expect(eventArgs[0]).to.equal(questionKey);
      expect(eventArgs[1]).to.deep.equal(arraifyAsEthers(seed)); // waffles chai matchers uses here equal
      expect(eventArgs[2]).to.equal(client.address);
    }
  }

  this.timeout(0);

  it('Can call ask with bytes24', async () => {
    const [machine, merkle, oracle, court, client] = await loadFixture(fixture);

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
    const [machine, merkle, oracle, court, client] = await loadFixture(fixture);

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
    const [machine, merkle, oracle, court, client] = await loadFixture(fixture);

    const askTx = await oracle.ask(
      machine.gen.genSeed(),
      5,
      encodeFunctionType(oracle, "ask"),
      encodeFunctionType(oracle, "answer"),
    );
    await askTx.wait();

    expect('ask').to.be.calledOnContract(oracle);
  });

  it('Ask question, give one answer, resolve with success', async () => {
    const [machine, merkle, oracle, court, client] = await loadFixture(fixture);
    const wallets = await client.provider.getWallets();
    let _court = await oracle.court();
    expect(_court).to.equal(wallets[0].address);

    // Actors
    const asker = wallets[1];
    const answerer = wallets[2];
    const resolver = wallets[3];

    // Inputs
    const seed = {
      "nums": [1, 2, 3, 4, 5]
    };

    let sum = 0;
    for (let i = 0; i < seed.nums.length; i++) {
      sum += seed.nums[i];
    }

    let image = {
      "sum": sum
    };

    let successCallback = encodeFunctionType(client, 'successCallback');
    let failCallback = encodeFunctionType(client, 'failCallback');

    let questionKey = await client._seedToInitialStateHash(seed);

    await checkNoQuestionBeforeAsk(oracle, questionKey);

    // Ask question
    await expect(client.connect(asker).askOracle(seed))
      .to.emit(oracle, 'NewQuestion');
      //.withArgs(questionKey, arraifyAsEthers(seed), client.address); // should be uncomment after https://github.com/EthWorks/Waffle/issues/245 will be resolved
    await checkNewQuestionEventsLogs(oracle, client, questionKey, seed);
    expect('ask').to.be.calledOnContractWith(oracle, [seed, clientDefaultTimeout, successCallback, failCallback]);

    await checkNewQuestionInOracle(oracle, questionKey, clientDefaultTimeout, successCallback, failCallback);

    // Receive imageHash
    let imageHash = await client.imageHashForExampleMachine(image);

    // Give one answer
    let answererBalanceInitial = await answerer.getBalance();
    await expect(oracle.connect(answerer).answer(questionKey, imageHash, {value: stake_size}))
      .to.emit(oracle, 'NewAnswer')
      .withArgs(questionKey, imageHash);

    let answererBalanceAfterAnswer = await answerer.getBalance();
    expect(answererBalanceInitial.sub(answererBalanceAfterAnswer) > stake_size, 'Answerer should put stake.').to.be.true;

    // Check oracle has a new answer in a storage
    let res = await oracle.getAnswer(imageHash);
    expect('getAnswer').to.be.calledOnContractWith(oracle, [imageHash]);
    expect(res[0]).to.equal(answerer.address, 'Answerer should match.');
    expect(res[1]).to.equal(0, 'Index in question member answerKeys array should be 0.');
    expect(res[2]).to.equal(questionKey, 'questionKey should match.');
    question = await oracle.questions(questionKey);
    expect(question[2]).to.equal(1, "numberOfUnfalsifiedAnswers should increase.");

    // Try to resolve with success
    await expect(oracle.connect(resolver).resolveSuccess(imageHash, image))
      .to.be.revertedWith('Fuck.Answering is still in progress.');
    await handleOracleTiming(oracle, questionKey);

    // Resolve with success
    await expect(oracle.connect(resolver).resolveSuccess(imageHash, image))
      .to.emit(oracle, 'QuestionResolvedSuccessfully');
      //.withArgs(questionKey, arraifyAsEthers(image)); // the same case as previously
    // temporary checking logs
    let questionResolvedSuccessfullyEvents = await oracle.queryFilter(oracle.filters.QuestionResolvedSuccessfully());
    eventArgs = questionResolvedSuccessfullyEvents[0].args;
    expect(eventArgs[0]).to.equal(questionKey);
    expect(eventArgs[1]).to.eql(arraifyAsEthers(image));

    // Check stogare effects (answer was deleted, question was deleted)
    await checkAnswerWasDeleted(oracle, imageHash);
    await checkQuestionWasDeleted(oracle, questionKey);

    // Check answerer balance changes
    let answererBalanceAfterResolve = await answerer.getBalance();
    expect(answererBalanceAfterResolve.sub(answererBalanceAfterAnswer), 'Answerer should receive stake back.').to.equal(stake_size);

    // Check callback
    res = await client.connect(asker).cache(questionKey);
    expect('cache').to.be.calledOnContractWith(client, [questionKey]);
    expect(res, 'imageHash should match in a cache.').to.equal(imageHash);
    res = await client.connect(asker).showImageByInitialStateHash(questionKey);
    expect('showImageByInitialStateHash').to.be.calledOnContractWith(client, [questionKey]);
    expect(res[0], 'Image should match.').to.equal(image.sum.toString());

  });

  it('Ask question, do not answer, resolve with fail', async () => {

    const [machine, merkle, oracle, court, client] = await loadFixture(fixture);
    const wallets = await client.provider.getWallets();

    // In this case (not calling answer function) we are able to set defaultTimeout as 1 sec
    await client.setTimeout(1);
    expect('setTimeout').to.be.calledOnContractWith(client, [1]);
    let res = await client.defaultTimeout();
    expect(res).to.equal(1);

    // Actors
    const asker = wallets[1];
    const resolver = wallets[2];

    // Inputs
    const seed = {
      "nums": [1, 2, 3, 4, 5]
    };

    let successCallback = encodeFunctionType(client, 'successCallback');
    let failCallback = encodeFunctionType(client, 'failCallback');

    let questionKey = await client._seedToInitialStateHash(seed);

    await checkNoQuestionBeforeAsk(oracle, questionKey);

    // Ask question
    await expect(client.connect(asker).askOracle(seed))
      .to.emit(oracle, 'NewQuestion')
      //.withArgs(questionKey, arrayifyAsEthers(seed), client.address);
    await checkNewQuestionEventsLogs(oracle, client, questionKey, seed);
    expect('ask').to.be.calledOnContractWith(oracle, [seed, 1, successCallback, failCallback]);

    // Check that new question is in Oracle storage
    question = await oracle.questions(questionKey);
    let askTime = question[0];
    await checkNewQuestionInOracle(oracle, questionKey, 1, successCallback, failCallback);

    // Try to resolve with fail (two attempts, due to client settings)
    for (let i = 1; i < 3; i++) {
      await expect(oracle.connect(resolver).resolveFail(questionKey))
        .to.be.revertedWith('It is not the time to give up yet.');
      await handleOracleTiming(oracle, questionKey, 2);
      askTime = await attemptToResolveFailWithClientRetry(oracle, client, resolver, questionKey, seed, clientDefaultTimeout, successCallback, failCallback, askTime);
      // Check sideeffects after attempt
      res = await client.timesRetried(questionKey);
      expect(res, "Should be " + i + " time retried.").to.equal(i);
      res = await client.failed(questionKey);
      expect(res, "Shouldn't be failed at this moment.").to.be.false;
    }

    // Finally resolve with fail
    await expect(oracle.connect(resolver).resolveFail(questionKey))
      .to.be.revertedWith('It is not the time to give up yet.');
    await handleOracleTiming(oracle, questionKey, 2);
    await expect(oracle.connect(resolver).resolveFail(questionKey))
      .to.emit(oracle, 'QuestionResolvedUnsuccessfully')
      .withArgs(questionKey);

    // Check sideeffects
    res = await client.timesRetried(questionKey);
    expect(res, "Should be two times retried.").to.equal(2);
    res = await client.failed(questionKey);
    expect(res, "initialStateHash should have true flag in a failed mapping on a client side.").to.be.true;

    // Check that question was removed
    await checkQuestionWasDeleted(oracle, questionKey);

  });

  it('Ask question, give 2 answers, resolve with fail', async () => {

    const [machine, merkle, oracle, court, client] = await loadFixture(fixture);
    const wallets = await client.provider.getWallets();

    // Actors
    const asker = wallets[1];
    const answerer1 = wallets[2];
    const answerer2 = wallets[3];
    const resolver = wallets[4];

    // Inputs
    const seed = {
      "nums": [1, 2, 3, 4, 5]
    };

    let sum = 0;
    for (let i = 0; i < seed.nums.length; i++) {
      sum += seed.nums[i];
    }

    let image = {
      "sum": sum
    };

    let successCallback = encodeFunctionType(client, 'successCallback');
    let failCallback = encodeFunctionType(client, 'failCallback');

    let questionKey = await client._seedToInitialStateHash(seed);

    await checkNoQuestionBeforeAsk(oracle, questionKey);

    // Ask question
    await expect(client.connect(asker).askOracle(seed))
      .to.emit(oracle, 'NewQuestion')
      //.withArgs(questionKey, arraifyAsEthers(seed), client.address);
    await checkNewQuestionEventsLogs(oracle, client, questionKey, seed);

    expect('ask').to.be.calledOnContractWith(oracle, [seed, clientDefaultTimeout, successCallback, failCallback]);

    // Check that new question is in Oracle storage
    question = await oracle.questions(questionKey);
    let askTime = question[0];
    await checkNewQuestionInOracle(oracle, questionKey, clientDefaultTimeout, successCallback, failCallback);

    // Receive imageHashes for two answers (one is correct, another one is wrong)
    let imageHash1 = await client.imageHashForExampleMachine(image);
    image.sum += 234;
    let imageHash2 = await client.imageHashForExampleMachine(image);
    image.sum -= 234;

    async function giveTwoAnswers() {
      // Give first answer (correct)
      let answerer1BalanceInitial = await answerer1.getBalance();
      await expect(oracle.connect(answerer1).answer(questionKey, imageHash1, {value: stake_size}))
        .to.emit(oracle, 'NewAnswer')
        .withArgs(questionKey, imageHash1);

      let answerer1BalanceAfterAnswer = await answerer1.getBalance();
      expect(answerer1BalanceInitial.sub(answerer1BalanceAfterAnswer) > stake_size, 'Answerer1 should put stake.').to.be.true;

      // Check oracle has a new answer in a storage
      let res = await oracle.getAnswer(imageHash1);
      expect('getAnswer').to.be.calledOnContractWith(oracle, [imageHash1]);
      expect(res[0]).to.equal(answerer1.address, 'Answerer1 should match.');
      expect(res[1]).to.equal(0, 'Index in question member answerKeys array should be 0.');
      expect(res[2]).to.equal(questionKey, 'questionKey should match.');
      question = await oracle.questions(questionKey);
      expect(question[2]).to.equal(1, "numberOfUnfalsifiedAnswers should increase.");

      // Give second answer (incorrect)
      let answerer2BalanceInitial = await answerer2.getBalance();
      await expect(oracle.connect(answerer2).answer(questionKey, imageHash2, {value: stake_size}))
        .to.emit(oracle, 'NewAnswer')
        .withArgs(questionKey, imageHash2);

      let answerer2BalanceAfterAnswer = await answerer2.getBalance();
      expect(answerer2BalanceInitial.sub(answerer2BalanceAfterAnswer) > stake_size, 'Answerer2 should put stake.').to.be.true;

      // Check oracle has a new answer in a storage
      res = await oracle.getAnswer(imageHash2);
      expect('getAnswer').to.be.calledOnContractWith(oracle, [imageHash2]);
      expect(res[0]).to.equal(answerer2.address, 'Answerer2 should match.');
      expect(res[1]).to.equal(1, 'Index in question member answerKeys array should be 1.');
      expect(res[2]).to.equal(questionKey, 'questionKey should match.');
      question = await oracle.questions(questionKey);
      expect(question[2]).to.equal(2, "numberOfUnfalsifiedAnswers should increase.");

      return [answerer1BalanceAfterAnswer, answerer2BalanceAfterAnswer];
    }

    async function checkAnswerDeletedAndStake(attemptValue) {
      // Check that answers was deleted and the stakes are still in Oracle
      await checkAnswerWasDeleted(oracle, imageHash1);
      await checkAnswerWasDeleted(oracle, imageHash2);
      res = await oracle.provider.getBalance(oracle.address);
      expect(res, "Stakes from two answers two times should be in Oracle contract.").to.equal(stake_size.mul(attemptValue));
      question = await oracle.questions(questionKey);
      expect(question[2]).to.equal(0, "numberOfUnfalsifiedAnswers should be default value.");
      // Check that answerers loose their stakes
      res = await answerer1.getBalance();
      expect(res, "Answerer1 should loose his stake.").to.equal(balancesAfterAnswers[0]);
      res = await answerer2.getBalance();
      expect(res, "Answerer2 should loose his stake.").to.equal(balancesAfterAnswers[1]);
    }

    let balancesAfterAnswers = await giveTwoAnswers();

    // Try to resolve with fail (two attempts, due to client settings)
    for (let i = 1; i < 3; i++) {
      await expect(oracle.connect(resolver).resolveFail(questionKey))
        .to.be.revertedWith('Fuck.It is not the time to give up yet.');
      await handleOracleTiming(oracle, questionKey, 2);
      askTime = await attemptToResolveFailWithClientRetry(oracle, client, resolver, questionKey, seed, clientDefaultTimeout, successCallback, failCallback, askTime);
      // Check sideeffects
      let res = await client.timesRetried(questionKey);
      expect(res, "Should be " + i + " time retried.").to.equal(i);
      res = await client.failed(questionKey);
      expect(res, "Shouldn't be failed at this moment.").to.be.false;
      await checkAnswerDeletedAndStake(2 * i);

      // failCallback retries to ask the question one more time, give answers one more time
      balancesAfterAnswers = await giveTwoAnswers();
    }

    // Finally resolve with fail
    await expect(oracle.connect(resolver).resolveFail(questionKey))
      .to.be.revertedWith('Fuck.It is not the time to give up yet.');
    await handleOracleTiming(oracle, questionKey, 2);
    await expect(oracle.connect(resolver).resolveFail(questionKey))
      .to.emit(oracle, 'QuestionResolvedUnsuccessfully')
      .withArgs(questionKey);

    // Check sideeffects
    res = await client.timesRetried(questionKey);
    expect(res, "Should be two times retried.").to.equal(2);
    res = await client.failed(questionKey);
    expect(res, "initialStateHash should have true flag in a failed mapping on a client side.").to.be.true;

    // Check that question was removed
    await checkQuestionWasDeleted(oracle, questionKey);
    // Check the answers deleted and the question deleted and balances doesn't change, Oracle holds all the stakes
    await checkAnswerDeletedAndStake(6);

  });

  it('Ask question, give 3 answers, failsify 2, resolve with success', async () => {

    const [machine, merkle, oracle, court, client] = await loadFixture(fixture);
    const wallets = await client.provider.getWallets();

    // Actors
    const asker = wallets[1];
    const answerer1 = wallets[2];
    const answerer2 = wallets[3];
    const answerer3 = wallets[4];
    const resolver = wallets[5];
    const prosecutor = wallets[6];

    // Inputs
    const seed = {
      "nums": [1, 2, 3, 4, 5]
    };

    let sum = 0;
    for (let i = 0; i < seed.nums.length; i++) {
      sum += seed.nums[i];
    }

    let image = {
      "sum": sum
    };

    let successCallback = encodeFunctionType(client, 'successCallback');
    let failCallback = encodeFunctionType(client, 'failCallback');

    let questionKey = await client._seedToInitialStateHash(seed);

    await checkNoQuestionBeforeAsk(oracle, questionKey);

    // Ask question
    await expect(client.connect(asker).askOracle(seed))
      .to.emit(oracle, 'NewQuestion')
      //.withArgs(questionKey, arraifyAsEthers(seed), client.address);
    await checkNewQuestionEventsLogs(oracle, client, questionKey, seed);

    expect('ask').to.be.calledOnContractWith(oracle, [seed, clientDefaultTimeout, successCallback, failCallback]);

    // Check that new question is in Oracle storage
    question = await oracle.questions(questionKey);
    let askTime = question[0];
    let numberOfUnfalsifiedAnswersInitial = parseInt(question[2]);
    await checkNewQuestionInOracle(oracle, questionKey, clientDefaultTimeout, successCallback, failCallback);

    // Receive imageHashes for three answers (one is correct, anothers are wrong)
    let imageHash1 = await client.imageHashForExampleMachine(image);
    image.sum += 234;
    let imageHash2 = await client.imageHashForExampleMachine(image);
    image.sum += 126;
    let imageHash3 = await client.imageHashForExampleMachine(image);
    image.sum -= 360;

    // Give first answer
    let answerer1BalanceInitial = await answerer1.getBalance();
    await expect(oracle.connect(answerer1).answer(questionKey, imageHash1, {value: stake_size}))
      .to.emit(oracle, 'NewAnswer')
      .withArgs(questionKey, imageHash1);

    let answerer1BalanceAfterAnswer = await answerer1.getBalance();
    expect(answerer1BalanceInitial.sub(answerer1BalanceAfterAnswer) > stake_size, 'Answerer1 should put stake.').to.be.true;

    // Check oracle has a new answer in a storage
    let res = await oracle.getAnswer(imageHash1);
    expect('getAnswer').to.be.calledOnContractWith(oracle, [imageHash1]);
    expect(res[0]).to.equal(answerer1.address, 'Answerer1 should match.');
    expect(res[1]).to.equal(0, 'Index in question member answerKeys array should be 0.');
    expect(res[2]).to.equal(questionKey, 'questionKey should match.');

    // Give second answer
    let answerer2BalanceInitial = await answerer2.getBalance();
    await expect(oracle.connect(answerer2).answer(questionKey, imageHash2, {value: stake_size}))
      .to.emit(oracle, 'NewAnswer')
      .withArgs(questionKey, imageHash2);

    let answerer2BalanceAfterAnswer = await answerer2.getBalance();
    expect(answerer2BalanceInitial.sub(answerer2BalanceAfterAnswer) > stake_size, 'Answerer2 should put stake.').to.be.true;

    // Check oracle has a new answer in a storage
    res = await oracle.getAnswer(imageHash2);
    expect('getAnswer').to.be.calledOnContractWith(oracle, [imageHash2]);
    expect(res[0]).to.equal(answerer2.address, 'Answerer2 should match.');
    expect(res[1]).to.equal(1, 'Index in question member answerKeys array should be 1.');
    expect(res[2]).to.equal(questionKey, 'questionKey should match.');

    // Give third answer
    let answerer3BalanceInitial = await answerer3.getBalance();
    await expect(oracle.connect(answerer3).answer(questionKey, imageHash3, {value: stake_size}))
      .to.emit(oracle, 'NewAnswer')
      .withArgs(questionKey, imageHash3);

    let answerer3BalanceAfterAnswer = await answerer3.getBalance();
    expect(answerer3BalanceInitial.sub(answerer3BalanceAfterAnswer) > stake_size, 'Answerer3 should put stake.').to.be.true;

    // Check oracle has a new answer in a storage
    res = await oracle.getAnswer(imageHash3);
    expect('getAnswer').to.be.calledOnContractWith(oracle, [imageHash3]);
    expect(res[0]).to.equal(answerer3.address, 'Answerer3 should match.');
    expect(res[1]).to.equal(2, 'Index in question member answerKeys array should be 2.');
    expect(res[2]).to.equal(questionKey, 'questionKey should match.');

    question = await oracle.questions(questionKey);
    expect(numberOfUnfalsifiedAnswersInitial + 3, "Should be three unfalsified answers.").to.equal(question[2]);

    // Falsify 2 answers
    let prosecutorBalanceInitial = await prosecutor.getBalance();
    await expect(oracle.falsify(imageHash2, prosecutor.address))
      .to.emit(oracle, 'AnswerFalsified')
      .withArgs(questionKey, imageHash2);

    let prosecutorBalanceAfterFalsify1 = await prosecutor.getBalance();
    expect(prosecutorBalanceAfterFalsify1.sub(prosecutorBalanceInitial), "Prosecutor should receive stake.").to.equal(stake_size);
    question = await oracle.questions(questionKey);
    expect(numberOfUnfalsifiedAnswersInitial + 2, "Should be two unfalsified answers.").to.equal(question[2]);
    // Check answer2 was deleted
    await checkAnswerWasDeleted(oracle, imageHash2);
    await expect(oracle.falsify(imageHash3, prosecutor.address))
      .to.emit(oracle, 'AnswerFalsified')
      .withArgs(questionKey, imageHash3);

    let prosecutorBalanceAfterFalsify2 = await prosecutor.getBalance();
    expect(prosecutorBalanceAfterFalsify2.sub(prosecutorBalanceAfterFalsify1), "Prosecutor should receive stake.").to.equal(stake_size);
    question = await oracle.questions(questionKey);
    expect(numberOfUnfalsifiedAnswersInitial + 1, "Should be one unfalsified answers.").to.equal(question[2]);

    // Check answer3 was deleted
    await checkAnswerWasDeleted(oracle, imageHash3);

    await expect(oracle.connect(resolver).resolveSuccess(imageHash1, image))
      .to.be.revertedWith('Fuck.Answering is still in progress.');
    await handleOracleTiming(oracle, questionKey);

    // Resolve with success
    await expect(oracle.connect(resolver).resolveSuccess(imageHash1, image))
      .to.emit(oracle, 'QuestionResolvedSuccessfully');
      //.withArgs(questionKey, arraifyAsEthers(image));
    // temporary checking logs
    let questionResolvedSuccessfullyEvents = await oracle.queryFilter(oracle.filters.QuestionResolvedSuccessfully());
    eventArgs = questionResolvedSuccessfullyEvents[0].args;
    expect(eventArgs[0]).to.equal(questionKey);
    expect(eventArgs[1]).to.eql(arraifyAsEthers(image));
    // Check storage effects
    // Check answer1 was deleted
    await checkAnswerWasDeleted(oracle, imageHash1);
    // Check question was deleted
    await checkQuestionWasDeleted(oracle, questionKey);
    // Check answerer balance changes
    let answerer1BalanceAfterResolve = await answerer1.getBalance();
    expect(answerer1BalanceAfterResolve.sub(answerer1BalanceAfterAnswer), 'Answerer1 should receive stake back.').to.equal(stake_size);

    // Check callback
    res = await client.cache(questionKey);
    expect('cache').to.be.calledOnContractWith(client, [questionKey]);
    expect(res, 'imageHash should match in a cache').to.equal(imageHash1);
    res = await client.showImageByInitialStateHash(questionKey);
    expect('showImageByInitialStateHash').to.be.calledOnContractWith(client, [questionKey]);
    expect(res[0], 'Image should match.').to.equal(image.sum.toString());
  });

});
