// Unit tests for ExampleMachine
const { pimpVerifier, arraifyAsEthers, increaseTime } = require('./utils');

const Machine = artifacts.require('Machine');
const Merkle = artifacts.require('Merkle');
const ClaimVerifier = artifacts.require('ClaimVerifier');
const ClaimFalsifier = artifacts.require('ClaimFalsifier');
const Client = artifacts.require('Client');
const DEFAULT_TIMEOUT = 60;
const DEFAULT_STAKE_SIZE = '0x2c68af0bb140000';
const DEFAULT_MAX_TREE_DEPTH = 3;

contract("EMO", async accounts => {
  const seed = { nums: [1, 2, 3, 12, 55] }; //replace with vm.generator (JAN: tool that ask dev to put nice seeds)
  const image = { sum : '0x49' }; //replace with OR(offchainRunner)
  const imageHash = '0x37e472f504e93744df80d87316862f9a8fd41a7bc266c723bf77df7866d75f55'; //replace with OR
  const commitmentRoot = '0x0f55728f6d68c0e75caaef1128cbbaf76c0708bde1405b99f615eac94317f5d6'; //JAN TODO: DO SOME MODULARITY TOOL THAT WILL TAKE OFFCHAINRUNNER AS A PARAMETER
  const zeroNode = {left: "0x0000000000000000000000000000000000000000000000000000000000000000", right: "0x0000000000000000000000000000000000000000000000000000000000000000"}; // take from TT
  let client;
  let verifier;
  let falsifier;
  let stake;

  beforeEach(async () => {
      client = await Client.new(DEFAULT_TIMEOUT); // -> this is not client-generic
      falsifier = await ClaimFalsifier.new(DEFAULT_STAKE_SIZE, DEFAULT_MAX_TREE_DEPTH, client.address);
      let verifierAddress = await falsifier.claimVerifier();
      stake = await falsifier.STAKE_SIZE();
      verifier = await ClaimVerifier.at(verifierAddress);
      pimpVerifier(verifier);
      client.setClaimVerifier(verifier.address); // -> this is not client-generic
      client.setStake(stake); // -> is not client-generic
  });

  it("First interection - testing clients claim function", async () => {
    // Starting from client claim
    // To claim we need random seed and image and root that should be computed by offchainRunner
    // TODO add offchainRunner - find a way to refactor truffle machineArtifact to machineArtifact that is used in offchainRunner
    // TODO Also expected that offchainRunner has functionality to compute root
    // Also need to run syntax checker (TODO complete syntaxChecker) before unit tests are run (probably need to write a script and use it in an alias to emo box)
    let tx = await client.makeClaim(seed, image, commitmentRoot, {value: stake});
    let balance = await web3.eth.getBalance(verifier.address);
    assert.equal(balance, stake, "Stake should be in a verifier contract");
    let clientTimeout = await client.defaultTimeout();
    let initialStateHash = await client._seedToInitialStateHash(seed); //TODO add function to OR to calculate initialStateHash
    let claim = await verifier.getClaim(commitmentRoot);

    // Check that ClaimVerifier state was changed and claims mapping has new struct value with actual data
    assert.equal(claim.timeout, clientTimeout, "Should be default client timeout");
    assert.equal(claim.stake, stake, "Should be defined stake");
    assert.equal(claim.initialStateHash, initialStateHash, "Initial state hash should match.");
    assert.equal(claim.imageHash, imageHash, "Image hash should match.");

    // Check NewClaim event
    let events = await verifier.getPastEvents('NewClaim', {fromBlock: 0});
    assert.equal(events.length, 1, "Should be only one event.");
    assert.deepEqual(events[0].args.seed, arraifyAsEthers(seed), "Seed should match.");
    assert.equal(events[0].args.imageHash, imageHash, "Image hash should match.");
    assert.equal(events[0].args.claimKey, commitmentRoot, "claimKey should be commitmentRoot");
  });

  it("Resolve true claim by timeout with no disputes", async () => {
    let initialStateHash = await client._seedToInitialStateHash(seed); //TODO add function to OR to calculate initialStateHash
    let tx = await client.makeClaim(seed, image, commitmentRoot, {value: stake});
    try {
      tx = await verifier.resolveTrueClaim(commitmentRoot);
    } catch (e) {
      assert.equal(e.reason, "Too early to resolve.", "Incorrect revert reason for resolving true claim.");
    }
    // Try to resolve unexisting claim
    try {
      tx = await verifier.resolveTrueClaim('0x0000000000000000000000000000000000000000000000000000000000000000');
    } catch (e) {
      assert.equal(e.reason, "Claim must exist.", "Incorrect revert reason for resolving true claim.");
    }
    await increaseTime(DEFAULT_TIMEOUT);
    tx = await verifier.resolveTrueClaim(commitmentRoot);
    // Check logs
    assert.equal(tx.logs.length, 1, 'trigger one event'); // Probably we want to test also the case when callback failed and there is second event CallbackFailed
    assert.equal(tx.logs[0].event, 'TrueClaim', 'Should match event name.');
    assert.equal(tx.logs[0].args.claimKey, commitmentRoot, 'claimKey should match.');

    // Checking only verifier balance. Skipped checking the client balance, because the subgoal is to make unit test generic for any client implementation.
    let balance = await web3.eth.getBalance(verifier.address);
    assert.equal(balance, 0, "Verifier should send stake to Client. Make sure Client contract has receive function.");

    // Checking the claim was deleted
    let claim = await verifier.getClaim(commitmentRoot);
    _checkClaimRemoved(claim);

  });

  it("Resolve true claim after dispute - win dispute by revealing Bottom", async () => {

    let initialStateHash = await client._seedToInitialStateHash(seed);
    // OR should be generated tree with leaves where the state at some point was changed for incorrect data
    let prosecutorRoot = '0xa85fd4c618094608febeb9c6b3620675449119984a3033998bcb095fa654b1a2';
    let defender = accounts[1];
    let prosecutor = accounts[2];

    // Make claim
    let tx = await client.makeClaim(seed, image, commitmentRoot, {from: defender, value: stake});

    // Starting dispute
    let prosecutorNode = { left: '0x67b4f81da177eb65cbc02831cde3a22068893ef8bf09397a561ee3f57876ec67', right: '0x5234644f91db7e3859deaf87dda0ec3f6ae7919aaa276b5766cb1256737fa1c0'};

    // Step1. prosecutor calls newDispute with args: defendantRoot(equals commitmentRoot) and prosecutorNode
    let actionTimestamp;
    let prosecutorTx = await falsifier.newDispute(commitmentRoot, prosecutorNode, {from: prosecutor, value: stake});

    _checkLogsNewDispute(prosecutorTx, commitmentRoot, prosecutorRoot);

    // Check ClaimFalsifier state changes
    let dispute = await falsifier.getDispute(prosecutorRoot);
    actionTimestamp = dispute.lastActionTimestamp;
    _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, commitmentRoot, prosecutor, prosecutorNode);

    // Step2. defendant calls reveal with args: prosecutorRoot, defendantNode, proofLeft, proofRight, finalState
    // TODO add function to OR to calculate proofs and finalState
    // PS. defendant should listen for NewDispute events and check if there is sense to defend claim
    let defendantNode = {left: '0x248d6a97a302463249c7fe155aa4318c9b973cd1acf3b14dc79281224930119e', right: '0x44b09b2058ff4b937f9e21d1bfd0b962f3f8ed7eaf739bbef325a86ea6ece36d'};
    let proofLeft = { leaf: '0x5410357b62791f26f99287ebaf54b7bbe7052868f670624e47a340e90cfed9aa', data: ['0xb7984d5438a716208aabd4f50a29a553bf2819960711ca32a5bde43904f5340f', '0xa808bdf2abec75c7a24c7f9e8871f60c6b34ea421183bf8b364b90a462ff91c8', '0x44b09b2058ff4b937f9e21d1bfd0b962f3f8ed7eaf739bbef325a86ea6ece36d'], path: '0x0' };
    let proofRight = { leaf: '0x9a0ca60aea446f0de2b73532837f00f56d3ae047e136f7838a520755c00b6e76', data: ['0xa1d6cc35d7461ab4bc48950f6e4a43fba9c4659a9436e9f1cd9c7bff84a3fcf4', '0xaaec016c9639cf7a30adefd3b638f057ea9acdbb7c085f851556455fb4ba9c3f', '0x248d6a97a302463249c7fe155aa4318c9b973cd1acf3b14dc79281224930119e'], path: '0x5' };
    let finalState = { stack: { topValues: [], hashOfRest: '0x0000000000000000000000000000000000000000000000000000000000000000', size: '0x0' }, sum: '0x49'};

    let defendandTx = await falsifier.reveal(prosecutorRoot, defendantNode, proofLeft, proofRight, finalState, {from: defender});

    _checkLogsReveal(defendandTx, prosecutorRoot, finalState);

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(prosecutorRoot);
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should match.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.state, 2, "Dispute state should be 'ProsecutorTurn'.");
    assert.equal(BigInt(dispute.numberOfSteps), BigInt(proofRight.path), "numberOfSteps should be equal path to the final leave.");
    assert.equal(dispute.goRight, false, "left nodes of the prosecutor and defendant nodes shouldn't be equal.");
    assert.equal(dispute.disagreementPoint, 0, "First disagreementPoint update.");
    assert.equal(dispute.depth, 1, "We should go deeper into the tree to the next level, depth should be 1 now.");

    //Step3. prosecutor calls prosecutorRespond with args: prosecutorRoot, prosecutorNode(next level, before calling check the dispute.goRight to define left or right node to use)
    //PS. prosector should listen for Reveal event and also checks the timeout if the event doesn't appear in the blockchain
    let goRight = dispute.goRight; // use left node
    prosecutorNode = {left: '0xdde68c0980d1f9a1634f72dc55ca8c3781c380fbfd9a587d9095c1831961b30b', right: '0xf8cdcd2843b0515eebf8c0f73552230ef3941a449bb8d512857ed65378868967'};
    prosecutorTx = await falsifier.prosecutorRespond(prosecutorRoot, prosecutorNode, {from: prosecutor});
    // TODO ClaimFalsifier add event to prosecutorRespond function so defendant is able to listen and respond

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(prosecutorRoot);
    assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.state, 3, "should be 'DefendantTurn'.");

    //Step4. defendant calls defendantRespond with args: prosecutorRoot, defendantNode
    //PS. there is the only way for defendant to call dispute and check dispute.state if it is his turn to action
    // check dispute.goRight -> use left node
    defendantNode = {left: '0xdde68c0980d1f9a1634f72dc55ca8c3781c380fbfd9a587d9095c1831961b30b', right: '0xa808bdf2abec75c7a24c7f9e8871f60c6b34ea421183bf8b364b90a462ff91c8'};
    defendandTx = await falsifier.defendantRespond(prosecutorRoot, defendantNode, {from: defender});
    // TODO ClaimFalsifier add event to defendantRespond function so prosecutor is able to listen and respond

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(prosecutorRoot);
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.goRight, true, "left nodes of the prosecutor and defendant nodes should be equal.");
    assert.equal(dispute.disagreementPoint, 1, "Second disagreementPoint update.");
    assert.equal(dispute.depth, 2, "We should go deeper into the tree to the next level, depth should be 2 now.");
    assert.equal(dispute.state, 2, "should be 'ProsecutorTurn'.");

    //Step5. prosecutor respond again
    goRight = dispute.goRight; // use right node
    prosecutorNode = {left: '0xc3aae5a739da6c190e76d2c015af15131bafd598de98a21e751e7cf2a2f16ecc', right: '0x366cf936b0ee074e3b77eabdf2be32f69e37205e203968becdf1e4ff988b04ec'};
    prosecutorTx = await falsifier.prosecutorRespond(prosecutorRoot, prosecutorNode, {from: prosecutor});

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(prosecutorRoot);
    assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.state, 3, "should be 'DefendantTurn'.");

    //Step6. defendant respond again
    defendantNode = {left: '0xc3aae5a739da6c190e76d2c015af15131bafd598de98a21e751e7cf2a2f16ecc', right: '0xef6440008831e204649db85ea30f8a74832226a477e715aac37bad50559080a7'};
    defendandTx = await falsifier.defendantRespond(prosecutorRoot, defendantNode, {from: defender});
    // TODO ClaimFalsifier add event to defendantRespond function so prosecutor is able to listen and respond

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(prosecutorRoot);
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.goRight, true, "left nodes of the prosecutor and defendant nodes should be equal.");
    assert.equal(dispute.firstDivergentStateHash, defendantNode.right, "The divergent state hash.");
    assert.equal(dispute.disagreementPoint, 3, "Third disagreementPoint update.");
    assert.equal(dispute.depth, DEFAULT_MAX_TREE_DEPTH, "We reached the bottom. The depth should be equal MAX_TREE_DEPTH.");
    assert.equal(dispute.state, 4, "should be 'Bottom'.");

    // Step7. defendant reveals bottom and wins dispute
    let proof = { leaf: '0xc3aae5a739da6c190e76d2c015af15131bafd598de98a21e751e7cf2a2f16ecc', data: ['0xef6440008831e204649db85ea30f8a74832226a477e715aac37bad50559080a7', '0xdde68c0980d1f9a1634f72dc55ca8c3781c380fbfd9a587d9095c1831961b30b', '0x44b09b2058ff4b937f9e21d1bfd0b962f3f8ed7eaf739bbef325a86ea6ece36d'], path: '0x02' };
    let defendantStateBeforeDisagreementPoint = {stack: {topValues: [1,2,3], hashOfRest: '0x0000000000000000000000000000000000000000000000000000000000000000', size: '0x03'}, sum: '0x43'};

    // Balances before revealing bottom
    let defenderBalanceBefore = await web3.eth.getBalance(defender);
    let falsifierBalanceBefore = await web3.eth.getBalance(falsifier.address);

    defendandTx = await falsifier.defendantRevealBottom(prosecutorRoot, proof, defendantStateBeforeDisagreementPoint, {from: defender});

    // Check dispute was deleted
    dispute = await falsifier.getDispute(prosecutorRoot);
    _checkDisputeRemoved(dispute);

    // SHOULD BE REMOVED IT'S CLIENT SPECIFIC LOGS
    // Check logs
    assert.equal(defendandTx.receipt.rawLogs.length, 1, 'trigger one event');
    assert.equal(defendandTx.receipt.rawLogs[0].address, client.address, "Make sure that the event is from Client.");
    assert.equal(defendandTx.receipt.rawLogs[0].topics[0], web3.utils.sha3('ClaimDefended(bytes32,bytes32,address)'), 'Should match the signature of the ClaimDefended event.');
    assert.equal(defendandTx.receipt.rawLogs[0].data, initialStateHash + commitmentRoot.replace('0x', '') + '000000000000000000000000' + defender.replace('0x', '').toLowerCase(), 'data should match.');
    // SHOULD BE REMOVED IT'S CLIENT SPECIFIC LOGS

    // Check balances to ensure that defender received prosecutors stake as a reward
    let defenderBalanceAfter = await web3.eth.getBalance(defender);
    assert((BigInt(defenderBalanceAfter) - BigInt(defenderBalanceBefore)) * 10n >= BigInt(stake) * BigInt('9'), "The defender must receive prosecutors stake, to compare was used 90% of the amount because of the gas fees.");

    let falsifierBalanceAfter = await web3.eth.getBalance(falsifier.address);
    assert.equal(falsifierBalanceBefore - falsifierBalanceAfter, stake, 'Falsifier must transfered prosecutor stake to prosecutor according to client implementation.');

    // Step8. defender resolves true claim via ClaimVerifier
    let verifierBalanceBefore = await web3.eth.getBalance(verifier.address);
    defenderBalanceBefore = await web3.eth.getBalance(defender);

    // Wait until timeout is over
    let claim = await verifier.getClaim(commitmentRoot);
    let timeoutPoint = parseInt(claim.timeout) + parseInt(claim.claimTime);
    let now = Math.floor(Date.now() / 1000);
    if (now < timeoutPoint) {
      increaseTime(timeoutPoint - now);
    }
    defendandTx = await verifier.resolveTrueClaim(commitmentRoot, {from: defender});

    // Check logs
    assert.equal(defendandTx.logs.length, 1, 'trigger one event');
    assert.equal(defendandTx.logs[0].event, 'TrueClaim', 'Should match event name.');
    assert.equal(defendandTx.logs[0].args.claimKey, commitmentRoot, 'defendantRoot should match.');

    let verifierBalanceAfter = await web3.eth.getBalance(verifier.address);
    defenderBalanceAfter = await web3.eth.getBalance(defender);

    assert.equal(verifierBalanceBefore - verifierBalanceAfter, stake, 'Verifier must transfered claimer stake to a client.');
    assert((BigInt(defenderBalanceAfter) - BigInt(defenderBalanceBefore)) * 10n >= BigInt(stake) * BigInt('9'), "The defender must receive claimers stake due to specific client implementation, to compare was used 90% of the amount because of the gas fees.");// -> not client-generic this client specific transfers this stake to defender

    // Check claim was deleted
    claim = await verifier.getClaim(commitmentRoot);
    _checkClaimRemoved(claim);

  });

  it("Falsify incorrect claim - go to Bottom and win dispute by timeout", async () => {
    let initialStateHash = await client._seedToInitialStateHash(seed); //TODO add function to OR to calculate initialStateHash
    image.sum = 78;
    let defendantRoot = '0xa85fd4c618094608febeb9c6b3620675449119984a3033998bcb095fa654b1a2';
    let defender = accounts[1];
    let prosecutor = accounts[2];
    let tx = await client.makeClaim(seed, image, defendantRoot, {from: defender, value: stake});
    // Starting dispute
    let prosecutorNode = {left: '0x248d6a97a302463249c7fe155aa4318c9b973cd1acf3b14dc79281224930119e', right: '0x44b09b2058ff4b937f9e21d1bfd0b962f3f8ed7eaf739bbef325a86ea6ece36d'}; // TODO add function to OR to calculate this
    // Step1. prosecutor calls newDispute with args: defendantRoot and prosecutorNode
    // PS. prosector should listen for NewClaim events and compute and check results to decide to open the dispute
    let actionTimestamp;
    let prosecutorTx = await falsifier.newDispute(defendantRoot, prosecutorNode, {from: prosecutor, value: stake});

    _checkLogsNewDispute(prosecutorTx, defendantRoot, commitmentRoot);

    // Check ClaimFalsifier state changes
    let dispute = await falsifier.getDispute(commitmentRoot);
    actionTimestamp = dispute.lastActionTimestamp;
    _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, defendantRoot, prosecutor, prosecutorNode);

    // Step2. defendant calls reveal with args: prosecutorRoot, defendantNode, proofLeft, proofRight, finalState
    // TODO add function to OR to calculate proofs and finalState
    // Also should be generated tree with leaves where the state at some point was changed for incorrect claim
    // PS. defendant should listen for NewDispute events and check if there is sense to defend claim
    let defendantNode = { left: '0x67b4f81da177eb65cbc02831cde3a22068893ef8bf09397a561ee3f57876ec67', right: '0x5234644f91db7e3859deaf87dda0ec3f6ae7919aaa276b5766cb1256737fa1c0'};
    let proofLeft = { leaf: '0x5410357b62791f26f99287ebaf54b7bbe7052868f670624e47a340e90cfed9aa', data: ['0xb7984d5438a716208aabd4f50a29a553bf2819960711ca32a5bde43904f5340f', '0xf8cdcd2843b0515eebf8c0f73552230ef3941a449bb8d512857ed65378868967', '0x5234644f91db7e3859deaf87dda0ec3f6ae7919aaa276b5766cb1256737fa1c0'], path: '0x0' };
    let proofRight = { leaf: '0x975563aaf6f6f5b1ac46e66712d675039c85d43cf7fcbd45f731d5ffd669b28d', data: ['0xa176ada614a810455b1100125b8ce3eab885f8ff886262726862a5c6aa547578', '0x13d08895ea1968a091993a1f7b696eb736e8837bc2cf030466e1ec49ccaaec1e', '0x67b4f81da177eb65cbc02831cde3a22068893ef8bf09397a561ee3f57876ec67'], path: '0x5' };
    let finalState = { stack: { topValues: [], hashOfRest: '0x0000000000000000000000000000000000000000000000000000000000000000', size: '0x0' }, sum: '0x4e'};

    let defendandTx = await falsifier.reveal(commitmentRoot, defendantNode, proofLeft, proofRight, finalState, {from: defender});

    _checkLogsReveal(defendandTx, commitmentRoot, finalState);

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(commitmentRoot);
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should match.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.state, 2, "Dispute state should be 'ProsecutorTurn'.");
    assert.equal(BigInt(dispute.numberOfSteps), BigInt(proofRight.path), "numberOfSteps should be equal path to the final leave.");
    assert.equal(dispute.goRight, false, "left nodes of the prosecutor and defendant nodes shouldn't be equal.");
    assert.equal(dispute.disagreementPoint, 0, "First disagreementPoint update.");
    assert.equal(dispute.depth, 1, "We should go deeper into the tree to the next level, depth should be 1 now.");

    //Step3. prosecutor calls prosecutorRespond with args: prosecutorRoot, prosecutorNode(next level, before calling check the dispute.goRight to define left or right node to use)
    //PS. prosector should listen for Reveal event and also checks the timeout if the event doesn't appear in the blockchain
    let goRight = dispute.goRight; // use left node
    prosecutorNode = {left: '0xdde68c0980d1f9a1634f72dc55ca8c3781c380fbfd9a587d9095c1831961b30b', right: '0xa808bdf2abec75c7a24c7f9e8871f60c6b34ea421183bf8b364b90a462ff91c8'};
    prosecutorTx = await falsifier.prosecutorRespond(commitmentRoot, prosecutorNode, {from: prosecutor});
    // TODO ClaimFalsifier add event to prosecutorRespond function so defendant is able to listen and respond

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(commitmentRoot);
    assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.state, 3, "should be 'DefendantTurn'.");

    //Step4. defendant calls defendantRespond with args: prosecutorRoot, defendantNode
    //PS. there is the only way for defendant to call dispute and check dispute.state if it is his turn to action
    // check dispute.goRight -> use left node
    defendantNode = {left: '0xdde68c0980d1f9a1634f72dc55ca8c3781c380fbfd9a587d9095c1831961b30b', right: '0xf8cdcd2843b0515eebf8c0f73552230ef3941a449bb8d512857ed65378868967'};
    defendandTx = await falsifier.defendantRespond(commitmentRoot, defendantNode, {from: defender});
    // TODO ClaimFalsifier add event to defendantRespond function so prosecutor is able to listen and respond

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(commitmentRoot);
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.goRight, true, "left nodes of the prosecutor and defendant nodes should be equal.");
    assert.equal(dispute.disagreementPoint, 1, "Second disagreementPoint update.");
    assert.equal(dispute.depth, 2, "We should go deeper into the tree to the next level, depth should be 2 now.");
    assert.equal(dispute.state, 2, "should be 'ProsecutorTurn'.");

    //Step5. prosecutor respond again
    goRight = dispute.goRight; // use right node
    prosecutorNode = {left: '0xc3aae5a739da6c190e76d2c015af15131bafd598de98a21e751e7cf2a2f16ecc', right: '0xef6440008831e204649db85ea30f8a74832226a477e715aac37bad50559080a7'};
    prosecutorTx = await falsifier.prosecutorRespond(commitmentRoot, prosecutorNode, {from: prosecutor});

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(commitmentRoot);
    assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.state, 3, "should be 'DefendantTurn'.");

    //Step6. defendant respond again
    defendantNode = {left: '0xc3aae5a739da6c190e76d2c015af15131bafd598de98a21e751e7cf2a2f16ecc', right: '0x366cf936b0ee074e3b77eabdf2be32f69e37205e203968becdf1e4ff988b04ec'};
    defendandTx = await falsifier.defendantRespond(commitmentRoot, defendantNode, {from: defender});
    // TODO ClaimFalsifier add event to defendantRespond function so prosecutor is able to listen and respond

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(commitmentRoot);
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.goRight, true, "left nodes of the prosecutor and defendant nodes should be equal.");
    assert.equal(dispute.firstDivergentStateHash, defendantNode.right, "The divergent state hash.");
    assert.equal(dispute.disagreementPoint, 3, "Third disagreementPoint update.");
    assert.equal(dispute.depth, DEFAULT_MAX_TREE_DEPTH, "We reached the bottom. The depth should be equal MAX_TREE_DEPTH.");
    assert.equal(dispute.state, 4, "should be 'Bottom'.");

    // Step7. defendant reveals bottom (but as the claim was incorrect he is not able to do it)
    let proof = { leaf: '0xc3aae5a739da6c190e76d2c015af15131bafd598de98a21e751e7cf2a2f16ecc', data: ['0x366cf936b0ee074e3b77eabdf2be32f69e37205e203968becdf1e4ff988b04ec', '0xdde68c0980d1f9a1634f72dc55ca8c3781c380fbfd9a587d9095c1831961b30b', '0x5234644f91db7e3859deaf87dda0ec3f6ae7919aaa276b5766cb1256737fa1c0'], path: '0x02' };
    let defendantStateBeforeDisagreementPoint = {stack: {topValues: [1,2,3], hashOfRest: '0x0000000000000000000000000000000000000000000000000000000000000000', size: '0x03'}, sum: '0x43'};
    try {
      defendandTx = await falsifier.defendantRevealBottom(commitmentRoot, proof, defendantStateBeforeDisagreementPoint, {from: defender});
    } catch (e) {
      assert.equal(e.reason, "Next computed state is not the one commited to.");
    }

    // Step8. prosecutor wins by timeout.
    dispute = await falsifier.getDispute(commitmentRoot);
    defendantRoot = dispute.defendantRoot;
    let claim = await verifier.getClaim(defendantRoot);
    let timeoutPoint = parseInt(claim.timeout) + parseInt(claim.claimTime);
    let now = Math.floor(Date.now() / 1000);
    if (now < timeoutPoint) {
      increaseTime(timeoutPoint - now);
    }

    // Balances before falsifying by timeout
    let prosecutorBalanceBefore = await web3.eth.getBalance(prosecutor);
    let falsifierBalanceBefore = await web3.eth.getBalance(falsifier.address);
    let verifierBalanceBefore = await web3.eth.getBalance(verifier.address);

    prosecutorTx = await falsifier.timeout(commitmentRoot, {from: prosecutor});
    // Check logs
    assert.equal(prosecutorTx.receipt.rawLogs.length, 1, 'trigger one event');
    assert.equal(prosecutorTx.receipt.rawLogs[0].address, verifier.address, "Make sure that the event is from ClaimVerifier.");
    assert.equal(prosecutorTx.receipt.rawLogs[0].topics[0], web3.utils.sha3('FalseClaim(bytes32)'), 'Should match the signature of the FalseClaim event.');
    assert.equal(prosecutorTx.receipt.rawLogs[0].data, defendantRoot, 'defendantRoot should match.');

    // Check balances to ensure that prosecutor received his stake and stake as a reward
    let prosecutorBalanceAfter = await web3.eth.getBalance(prosecutor);
    assert((BigInt(prosecutorBalanceAfter) - BigInt(prosecutorBalanceBefore)) * 10n >= BigInt(stake) * BigInt('18'), "The prosecutor must receive 2 stakes, to compare was used 90% of the amount because of the gas fees.");

    let falsifierBalanceAfter = await web3.eth.getBalance(falsifier.address);
    assert.equal(falsifierBalanceBefore - falsifierBalanceAfter, stake, 'Falsifier must transfered prosecutor stake to prosecutor.');

    let verifierBalanceAfter = await web3.eth.getBalance(verifier.address);
    assert.equal(verifierBalanceBefore - verifierBalanceAfter, stake, 'Verifier must transfered claimer stake to prosecutor.');

    // Check dispute was deleted
    dispute = await falsifier.getDispute(commitmentRoot);
    _checkDisputeRemoved(dispute);

    // Check claim was deleted
    claim = await verifier.getClaim(defendantRoot);
    _checkClaimRemoved(claim);

  });



  it("Falsify incorrect claim - Left leaf does not match initial state hash", async () => {
    let initialStateHash = await client._seedToInitialStateHash(seed); //TODO add function to OR to calculate initialStateHash
    image.sum = 74;
    let defendantRoot = '0x15f9e124e70f5ff0f9c560913a2127d759b21ba7dbdc263396859ba7b71cfb0c';
    let tx = await client.makeClaim(seed, image, defendantRoot, {value: stake});
    // Starting dispute
    let prosecutor = accounts[2];
    let defender = accounts[1];
    let prosecutorNode = {left: '0x248d6a97a302463249c7fe155aa4318c9b973cd1acf3b14dc79281224930119e', right: '0x44b09b2058ff4b937f9e21d1bfd0b962f3f8ed7eaf739bbef325a86ea6ece36d'}; // TODO add function to OR to calculate this
    // Step1. prosecutor calls newDispute with args: defendantRoot and prosecutorNode
    let prosecutorTx = await falsifier.newDispute(defendantRoot, prosecutorNode, {from: prosecutor, value: stake});
    // Check logs
    assert.equal(prosecutorTx.logs.length, 1, 'trigger one event');
    assert.equal(prosecutorTx.logs[0].event, 'NewDispute', 'Should match event name.');
    assert.equal(prosecutorTx.logs[0].args.defendantRoot, defendantRoot, 'defendantRoot should match.');
    assert.equal(prosecutorTx.logs[0].args.prosecutorRoot, commitmentRoot, 'prosecutorRoot should match.');
    // Check ClaimFalsifier state changes
    let dispute = await falsifier.getDispute(commitmentRoot);
    assert.equal(dispute.defendantRoot, defendantRoot, "defendantRoot should match.");
    assert.equal(dispute.prosecutor, prosecutor, "prosecutor address should match.");
    assert(dispute.lastActionTimestamp > 0, "timestamp should be set.");
    assert.equal(dispute.numberOfSteps, 0, "numberOfSteps should be 0 here.");
    assert.equal(dispute.disagreementPoint, 0, "disagreementPoint should be 0 here.");
    assert.equal(dispute.firstDivergentStateHash, '0x0000000000000000000000000000000000000000000000000000000000000000', "firstDivergentStateHash shouldn't be set here.");
    assert.equal(dispute.depth, 0, "depth should be 0 here.");
    assert.equal(dispute.goRight, false, "goRight should be default value.");
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers({left: "0x0000000000000000000000000000000000000000000000000000000000000000", right: "0x0000000000000000000000000000000000000000000000000000000000000000"}), "defendantNode shouldn't be set up yet.");
    assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should match");
    assert.equal(dispute.state, 1, "Dispute state should be 'Opened'.");

    // Step2. defendant calls reveal with args: prosecutorRoot, defendantNode, proofLeft, proofRight, finalState
    // TODO add function to OR to calculate proofs and finalState
    // NEXT STEP calculate proofs and state values for correct shit
    let defendantNode = { left: '0xf55c805e54c2bca8beab6aed357cdda26955844103a869afa56a8244d13d0c95', right: '0x4d2c2fff031c040b0e37bd4783e1eadd4f6b06dbc322b5c211c38969f2da6701'};
    let proofLeft = { leaf: '0xd8924d1d108c934d72b69fb0fca27debcc7d02a479a46dc668def5e220eb9e5e', data: ['0xbb8e29e6a46b3649d7a511f7a2087dd534c4ee0adea17690df68c9a12ff5ae66', '0x015fcf087d8986cb21c5531122ccca43be2ad9d8633dab1e359ef7909b7f4e4b', '0x4d2c2fff031c040b0e37bd4783e1eadd4f6b06dbc322b5c211c38969f2da6701'], path: '0x0' };
    let proofRight = { leaf: '0x5260d36d21f8359821a072aff7b4be49946e72f371a0eaed97092c5b641059e2', data: ['0x12a3a8bf1017d4e0fc9fff7327c99a81db521dabb02d5b0f973d7788495cbdb1', '0x63b210f66bc4b415fcc6afb68280946d395ceafec0d7460ded8268babbf5cb29', '0xf55c805e54c2bca8beab6aed357cdda26955844103a869afa56a8244d13d0c95'], path: '0x5' };
    let finalState = { stack: { topValues: [], hashOfRest: '0x0000000000000000000000000000000000000000000000000000000000000000', size: '0x0' }, sum: '0x4a'};
    try {
      let defendandTx = await falsifier.reveal(commitmentRoot, defendantNode, proofLeft, proofRight, finalState, {from: defender});
    } catch (e) {
      assert.equal(e.reason, "Left leaf does not match initial state hash.")
    }
  });

  it("Falsify incorrect claim - The revealed final state does not produce the image hash submitted in the claim.", async () => {
    let initialStateHash = await client._seedToInitialStateHash(seed); //TODO add function to OR to calculate initialStateHash
    image.sum = 543;
    let tx = await client.makeClaim(seed, image, commitmentRoot, {value: stake});
    // Starting dispute
    let prosecutor = accounts[2];
    let defender = accounts[1];
    let prosecutorNode = {left: '0x248d6a97a302463249c7fe155aa4318c9b973cd1acf3b14dc79281224930119e', right: '0x44b09b2058ff4b937f9e21d1bfd0b962f3f8ed7eaf739bbef325a86ea6ece36d'}; // TODO add function to OR to calculate this
    // Step1. prosecutor calls newDispute with args: defendantRoot and prosecutorNode
    let prosecutorTx = await falsifier.newDispute(commitmentRoot, prosecutorNode, {from: prosecutor, value: stake});
    // Check logs
    assert.equal(prosecutorTx.logs.length, 1, 'trigger one event');
    assert.equal(prosecutorTx.logs[0].event, 'NewDispute', 'Should match event name.');
    assert.equal(prosecutorTx.logs[0].args.defendantRoot, commitmentRoot, 'defendantRoot should match.');
    assert.equal(prosecutorTx.logs[0].args.prosecutorRoot, commitmentRoot, 'prosecutorRoot should match.');
    // Check ClaimFalsifier state changes
    let dispute = await falsifier.getDispute(commitmentRoot);
    assert.equal(dispute.defendantRoot, commitmentRoot, "defendantRoot should match.");
    assert.equal(dispute.prosecutor, prosecutor, "prosecutor address should match.");
    assert(dispute.lastActionTimestamp > 0, "timestamp should be set.");
    assert.equal(dispute.numberOfSteps, 0, "numberOfSteps should be 0 here.");
    assert.equal(dispute.disagreementPoint, 0, "disagreementPoint should be 0 here.");
    assert.equal(dispute.firstDivergentStateHash, '0x0000000000000000000000000000000000000000000000000000000000000000', "firstDivergentStateHash shouldn't be set here.");
    assert.equal(dispute.depth, 0, "depth should be 0 here.");
    assert.equal(dispute.goRight, false, "goRight should be default value.");
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers({left: "0x0000000000000000000000000000000000000000000000000000000000000000", right: "0x0000000000000000000000000000000000000000000000000000000000000000"}), "defendantNode shouldn't be set up yet.");
    assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should match");
    assert.equal(dispute.state, 1, "Dispute state should be 'Opened'.");

    // Step2. defendant calls reveal with args: prosecutorRoot, defendantNode, proofLeft, proofRight, finalState
    // TODO add function to OR to calculate proofs and finalState
    // NEXT STEP calculate proofs and state values for correct shit
    let proofLeft = { leaf: '0x5410357b62791f26f99287ebaf54b7bbe7052868f670624e47a340e90cfed9aa', data: ['0xb7984d5438a716208aabd4f50a29a553bf2819960711ca32a5bde43904f5340f', '0xa808bdf2abec75c7a24c7f9e8871f60c6b34ea421183bf8b364b90a462ff91c8', '0x44b09b2058ff4b937f9e21d1bfd0b962f3f8ed7eaf739bbef325a86ea6ece36d'], path: '0x0' };
    let proofRight = { leaf: '0x9a0ca60aea446f0de2b73532837f00f56d3ae047e136f7838a520755c00b6e76', data: ['0xa1d6cc35d7461ab4bc48950f6e4a43fba9c4659a9436e9f1cd9c7bff84a3fcf4', '0xaaec016c9639cf7a30adefd3b638f057ea9acdbb7c085f851556455fb4ba9c3f', '0x248d6a97a302463249c7fe155aa4318c9b973cd1acf3b14dc79281224930119e'], path: '0x5' };
    let finalState = { stack: { topValues: [], hashOfRest: '0x0000000000000000000000000000000000000000000000000000000000000000', size: '0x0' }, sum: '0x49'};
    try {
      let defendandTx = await falsifier.reveal(commitmentRoot, prosecutorNode, proofLeft, proofRight, finalState, {from: defender});

    } catch (e) {
      assert.equal(e.reason, "The revealed final state does not produce the image hash submitted in the claim.");
    }

  });


});

function _checkLogsNewDispute(prosecutorTx, defendantRoot, prosecutorRoot) {
  assert.equal(prosecutorTx.logs.length, 1, 'trigger one event');
  assert.equal(prosecutorTx.logs[0].event, 'NewDispute', 'Should match event name.');
  assert.equal(prosecutorTx.logs[0].args.defendantRoot, defendantRoot, 'defendantRoot should match.');
  assert.equal(prosecutorTx.logs[0].args.prosecutorRoot, prosecutorRoot, 'prosecutorRoot should match.');
}

function _checkLogsReveal(defendandTx, prosecutorRoot, finalState) {
  assert.equal(defendandTx.logs.length, 1, 'trigger one event');
  assert.equal(defendandTx.logs[0].event, 'Reveal', 'Should match event name.');
  assert.equal(defendandTx.logs[0].args.prosecutorRoot, prosecutorRoot, 'prosecutorRoot should match.');
  //assert.deepEqual(defendandTx.logs[0].args.finalState, arraifyAsEthers(finalState), 'finalState should match.'); TODO
}

function _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, defendantRoot, prosecutor, prosecutorNode) {
  assert.equal(dispute.defendantRoot, defendantRoot, "defendantRoot should match.");
  assert.equal(dispute.prosecutor, prosecutor, "prosecutor address should match.");
  assert(dispute.lastActionTimestamp > 0, "timestamp should be set.");
  assert.equal(dispute.numberOfSteps, 0, "numberOfSteps should be 0 here.");
  assert.equal(dispute.disagreementPoint, 0, "disagreementPoint should be 0 here.");
  assert.equal(dispute.firstDivergentStateHash, '0x0000000000000000000000000000000000000000000000000000000000000000', "firstDivergentStateHash shouldn't be set here.");
  assert.equal(dispute.depth, 0, "depth should be 0 here.");
  assert.equal(dispute.goRight, false, "goRight should be default value.");
  assert.deepEqual(dispute.defendantNode, arraifyAsEthers(zeroNode), "defendantNode shouldn't be set up yet.");
  assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should match");
  assert.equal(dispute.state, 1, "Dispute state should be 'Opened'.");
}

function _checkClaimRemoved(claim) {
  assert.equal(claim.timeout, 0, "Claim should be deleted. timeout doesn't match.");
  assert.equal(claim.stake, 0, "Claim should be deleted. stake doesn't match.");
  assert.equal(claim.initialStateHash, "0x0000000000000000000000000000000000000000000000000000000000000000", "Claim should be deleted. initialStateHash doesn't match.");
  assert.equal(claim.imageHash, "0x0000000000000000000000000000000000000000000000000000000000000000", "Claim should be deleted. imageHash doesn't match.");
}

function _checkDisputeRemoved(dispute) {
  assert.equal(dispute.defendantRoot, '0x0000000000000000000000000000000000000000000000000000000000000000', "defendantRoot should be 0.");
  assert.equal(dispute.prosecutor, '0x0000000000000000000000000000000000000000', "prosecutor address should be 0.");
  assert.equal(dispute.lastActionTimestamp, '0', "timestamp should be 0.");
  assert.equal(dispute.numberOfSteps, '0', "numberOfSteps should be 0.");
  assert.equal(dispute.disagreementPoint, 0, "disagreementPoint should be 0.");
  assert.equal(dispute.firstDivergentStateHash, '0x0000000000000000000000000000000000000000000000000000000000000000', "firstDivergentStateHash should be 0.");
  assert.equal(dispute.depth, 0, "depth should be 0.");
  assert.equal(dispute.goRight, false, "goRight should be default value.");
  assert.deepEqual(dispute.defendantNode, arraifyAsEthers({left: "0x0000000000000000000000000000000000000000000000000000000000000000", right: "0x0000000000000000000000000000000000000000000000000000000000000000"}), "defendantNode shouldn't be set up.");
  assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers({left: "0x0000000000000000000000000000000000000000000000000000000000000000", right: "0x0000000000000000000000000000000000000000000000000000000000000000"}), "prosecutorNode shouldn't be set up.");
  assert.equal(dispute.state, 0, "Dispute state should be 'DoesNotExist'.");
}

/*
// REQUIRE checks:
// Checking incorrect newDispute inputs
try {
  tx = await falsifier.newDispute('0x0000000000000000000000000000000000000000000000000000000000000000', prosecutorNode, {from: prosecutor, value: stake});
} catch (e) {
  assert.equal(e.reason, "Claim does not exists.");
}
try {
  tx = await falsifier.newDispute(commitmentRoot, prosecutorNode, {from: prosecutor});
} catch (e) {
  assert.equal(e.reason, "Not enough stake sent.");
}
try {
  tx = await falsifier.newDispute(commitmentRoot, prosecutorNode, {from: prosecutor, value: stake});
} catch (e) {
  assert.equal(e.reason, "Dispute already exists.");
}
try {
  await increaseTime(DEFAULT_TIMEOUT);
  tx = await falsifier.newDispute(commitmentRoot, prosecutorNode, {from: prosecutor, value: stake});
} catch (e) {
  assert.equal(e.reason, "There is not enough time left for a dispute.");
}

// Add checks incorrect reveal inputs
*/
