import * as anchor from '@project-serum/anchor';
import { Program, AnchorProvider } from '@project-serum/anchor';
import { GovernanceSplTests } from '../target/types/governance_spl_tests';

import BN from 'bn.js';
import {expect} from '@jest/globals';

import { 
  Keypair,
  PublicKey,
  TransactionInstruction,
  GetVersionedTransactionConfig,
  Connection,
  SystemProgram,
} from '@solana/web3.js';

import { 
  sleep,
  SolanaProvider,
  TieredBroadcaster,
  TransactionEnvelope,
  TransactionReceipt,
  PendingTransaction,
} from '@saberhq/solana-contrib'

import { 
  PROGRAM_VERSION_V3,
  withCreateGovernance,
  withCreateProposal,
  GovernanceConfig,
  VoteTipping,
  VoteThresholdType,
  VoteThreshold,
  getGovernance,
  Governance,
  ProgramAccount,
  VoteType,
  getProposal,
  getTokenOwnerRecord,
  Vote,
  VoteKind,
  VoteChoice,
  withCastVote,
  getVoteRecord,
  withSignOffProposal,
  withFinalizeVote,
  withInsertTransaction,
} from '@solana/spl-governance';

import { 
  RealmHelper,
  MintHelper,
  TokenOwnerRecordHelper,
  KeypairSignerHelper,
  SplGovHelper,
} from '@marinade.finance/solana-test-utils'
import { inspect } from 'util';


async function createGovernance({tokenOwnerRecord, yesVotePercentage}:{
  tokenOwnerRecord: TokenOwnerRecordHelper;
  yesVotePercentage: number;
}): Promise<ProgramAccount<Governance>> {
  const voteThreshold = new VoteThreshold({
    value: yesVotePercentage,
    type: VoteThresholdType.YesVotePercentage,
  });
  const disabledThreshold = new VoteThreshold({ type: VoteThresholdType.Disabled });

  let tx = new TransactionEnvelope(tokenOwnerRecord.provider, []);
  const governancePubkey = await withCreateGovernance(
    tx.instructions,
    tokenOwnerRecord.splGovId,
    tokenOwnerRecord.splGovVersion,
    tokenOwnerRecord.realm.address,
    undefined,
    new GovernanceConfig({
      communityVoteThreshold: voteThreshold,
      communityVetoVoteThreshold: disabledThreshold,
      communityVoteTipping: VoteTipping.Early,
      minCommunityTokensToCreateProposal: new BN(1),
      councilVoteThreshold: voteThreshold,
      councilVetoVoteThreshold: disabledThreshold,
      councilVoteTipping: VoteTipping.Early,
      minCouncilTokensToCreateProposal: new BN(1),
      minInstructionHoldUpTime: 0,
      maxVotingTime: 1,  // TODO: may max voting time make the test instable? for example when slow the cast get ({"err":{"InstructionError":[0,{"Custom":536}]}})
    }),
    tokenOwnerRecord.address,
    tokenOwnerRecord.provider.wallet.publicKey,
    tokenOwnerRecord.provider.wallet.publicKey
  );
  const txCreateGovernanceResult: TransactionReceipt = await tx.confirm();
  // txCreateGovernanceResult.printLogs();
  return await getGovernance(tokenOwnerRecord.provider.connection, governancePubkey);
}

async function waitPendingTxn(solanaProvider:SolanaProvider, pendingTx: PendingTransaction) {
  for (let i=0; i<=10; i++) {
    const anchorTxResult = await solanaProvider.connection.getTransaction(pendingTx.signature)
    if (!anchorTxResult) {
      await sleep(500)
      continue
    }
    // console.log(
    //   "txn:" + pendingTx.signature,
    //   inspect(anchorTxResult.transaction.message.accountKeys),
    //   inspect(anchorTxResult.meta?.logMessages)
    // )
    console.log(
      "txn:" + pendingTx.signature,
      inspect(anchorTxResult.transaction.message.accountKeys),
      inspect(anchorTxResult.meta?.logMessages),
      // inspect(anchorTxResult.transaction.signatures),
      // inspect(anchorTxResult.transaction.message.getAccountKeys()),
    )
    break
  }
}

describe('governance-spl-tests', () => {
  // Configure the client to use the local cluster.
  // anchor.setProvider(anchor.AnchorProvider.env());
  let anchorOptions = AnchorProvider.defaultOptions()
  anchorOptions.commitment = "confirmed"
  anchorOptions.preflightCommitment = "confirmed"
  anchor.setProvider(anchor.AnchorProvider.local(undefined, anchorOptions))

  const broadcaster = new TieredBroadcaster(
    anchor.getProvider().connection,
    [],
    (anchor.getProvider() as AnchorProvider).opts
  );
  const confirmOpts = (anchor.getProvider() as AnchorProvider).opts;
  // do we want the pre-flight or not? :-)
  confirmOpts.skipPreflight = true;
  const solanaProvider = new SolanaProvider(
    anchor.getProvider().connection,
    broadcaster,
    (anchor.getProvider() as AnchorProvider).wallet,
    confirmOpts,
  );

  const program = anchor.workspace
    .GovernanceSplTests as Program<GovernanceSplTests>;

  it('MultiChoice governance setup', async () => {
    // const anchorProgramTxn = new TransactionEnvelope(solanaProvider, []);
    // const typedArray = new Uint8Array([175, 175, 109, 31, 13, 152, 155, 237]);
    // // from anchor extend - check for 'match sighash'
    // const anchorProgramIx = new TransactionInstruction({data: Buffer.from(typedArray), keys: [], programId: program.programId  })
    // anchorProgramTxn.instructions.push(anchorProgramIx)
    // const pendingTx = await anchorProgramTxn.send()
    // await waitPendingTxn(solanaProvider, pendingTx)

    // Add your test here.
    // const tx = await program.methods.initialize().rpc();
    // console.log('Your transaction signature', tx);
    const councilMint: MintHelper = await MintHelper.create({provider: solanaProvider});
    const coummunityMint: MintHelper = await MintHelper.create({provider: solanaProvider});

    const realm = await RealmHelper.create({
      provider: solanaProvider,
      splGovVersion: PROGRAM_VERSION_V3,
      name: "test_realm_from_ts",
      communityMint: coummunityMint,
      councilMint: councilMint
    });

    const testUser = new Keypair();
    const keypairSignerHelper = new KeypairSignerHelper(testUser);
    const side = 'community';
    const testUserTokenOwnerRecordHelper = await TokenOwnerRecordHelper.create({
      realm,
      side,
      owner: keypairSignerHelper,
    });
    await testUserTokenOwnerRecordHelper.deposit(new BN(1000));
    const testUserTokenOwnerRecord = await getTokenOwnerRecord(
      solanaProvider.connection, testUserTokenOwnerRecordHelper.address
    );

    // transfer testing
    const randomPubkey = PublicKey.unique()
    const randomPubkey2 = PublicKey.unique()
    const transferIx: TransactionInstruction = SystemProgram.transfer({
      fromPubkey: (anchor.getProvider() as AnchorProvider).wallet.publicKey,
      toPubkey: randomPubkey2,
      lamports: 100,
    })
    console.log(inspect(transferIx.keys), (anchor.getProvider() as AnchorProvider).wallet.publicKey)
    const transferEnvelope = new TransactionEnvelope(solanaProvider, []);
    transferEnvelope.instructions.push(transferIx)
    const transferTxnSend = await transferEnvelope.send()
    // transferEnvelope.simulate
    await waitPendingTxn(solanaProvider, transferTxnSend)
    if (1 == 1) {
      return
    }

    // governance
    const governanceData = await createGovernance({
      tokenOwnerRecord: testUserTokenOwnerRecordHelper, yesVotePercentage: 30
    });

    console.log("OK realm:", realm.data.account);
    console.log("OK governance: ", governanceData);
    console.log("OK token owner record: ", testUserTokenOwnerRecord.account);

    // hack to access the private constructor. we really don't want to mix&match kedgeree
    const splGovHelper = new (SplGovHelper as any)(governanceData!, testUserTokenOwnerRecord, side);
    // const proposalHelper = ProposalHelper.create({
    //   ownerRecord: testUserTokenOwnerRecord,
    //   governance: splGovHelper,
    //   name: "proposal 1",
    //   descriptionLink: "my first proposal",
    //   executable: undefined,
    //   side: side,
    // });

    const numberChoices = 130;
    // const options =Array.from(Array(numberChoices).keys()).map(i => String(i).padStart(3, '0'));
    const options =Array.from(Array(numberChoices).keys()).map(i => "1");
    console.log("options", options)
    console.log(`Creating a proposal at ${realm.splGovId}, realm: ${realm.address}, governance: ${governanceData.pubkey}`)
    const txProposalCreation = new TransactionEnvelope(solanaProvider, []);
    const proposalPubkey = await withCreateProposal(
      txProposalCreation.instructions,
      realm.splGovId,
      PROGRAM_VERSION_V3,
      realm.address,
      governanceData.pubkey,
      testUserTokenOwnerRecord.pubkey,
      "proposal 1",
      "my first proposal",
      coummunityMint.address,  // side == 'community'
      testUserTokenOwnerRecordHelper.owner.authority,
      governanceData.account.proposalCount,
      VoteType.MULTI_CHOICE(numberChoices),
      options,
      true,  // useDenyOption; when set to true then final state of the proposal is `Succeeded(3)`, when false the final state is `Completed(5)`
      solanaProvider.wallet.publicKey,
      undefined  // voterWeightRecord addin
    );
    // WTF!? :: failed to send transaction: Transaction simulation failed: Error processing Instruction 0: invalid instruction data
    await testUserTokenOwnerRecordHelper.owner.runTx(txProposalCreation);  // we need to sign with testUserTokenOwnerRecord.owner.authority
    const proposalData = await getProposal(solanaProvider.connection, proposalPubkey);
    console.log("OK proposal vote type: ", proposalData.account.voteType);
    console.log("OK proposal state: ", proposalData.account.state);
    console.log("OK proposal options: ", proposalData.account.options);

    // await withInsertTransaction(
    //   [anchorProgramIx], // instructions
    //   realm.splGovId, // programId
    //   PROGRAM_VERSION_V3, // programVersion
    //   governanceData.pubkey, // governance
    //   proposalPubkey, // proposal
    //   testUserTokenOwnerRecord.pubkey, // tokenOwnerRecord
    //   testUserTokenOwnerRecordHelper.owner.authority, // governanceAuthority: PublicKey,
    //   index: number,
    //   optionIndex: number,
    //   holdUpTime: number,
    //   transactionInstructions: InstructionData[],
    //   payer: PublicKey,
    // )

    const signer = testUserTokenOwnerRecordHelper.owner.canSign
      ? testUserTokenOwnerRecordHelper.owner
      : testUserTokenOwnerRecordHelper.delegate!;
    
    const txProposalSignOff = new TransactionEnvelope(solanaProvider, []);
    withSignOffProposal(
      txProposalSignOff.instructions,
      realm.splGovId,
      PROGRAM_VERSION_V3,
      realm.address,
      governanceData.pubkey,
      proposalData.pubkey,
      testUserTokenOwnerRecordHelper.owner.authority,
      undefined,
      testUserTokenOwnerRecord.pubkey
      );
    await signer.runTx(txProposalSignOff);
    const proposalSignedOffData = await getProposal(solanaProvider.connection, proposalPubkey);
    console.log("OK sign off proposal state: ", proposalSignedOffData.account.state);
      
    // and when proposal is created and signed-off, let's cast a vote
    const votes = [...new Array(numberChoices)].map(
      i =>  new VoteChoice({
        rank: 0,
        weightPercentage: 0,
      })
    );
    if (numberChoices > 0) votes[0].weightPercentage = 100; // first option voted at 100%
    const txVote = new TransactionEnvelope(solanaProvider, []);
    const voteRecordPublickey: PublicKey = await withCastVote(
      txVote.instructions,
      realm.splGovId,
      PROGRAM_VERSION_V3,
      realm.address,
      governanceData.pubkey,
      proposalData.pubkey,
      testUserTokenOwnerRecord.pubkey, // tokenOwnerAuthority
      testUserTokenOwnerRecord.pubkey,  // governanceAuthority
      signer.authority,
      coummunityMint.address,
      new Vote({
        voteType: VoteKind.Approve,
        approveChoices: votes,
        deny: undefined,
        veto: undefined,
      }),
      solanaProvider.wallet.publicKey,
      undefined,
      undefined
    );
    await signer.runTx(txVote);
    const voteRecord = await getVoteRecord(solanaProvider.connection, voteRecordPublickey);
    // console.log("OK vote", voteRecord);

    const proposalVotedData = await getProposal(solanaProvider.connection, proposalPubkey);
    console.log("OK voted proposal state: ", proposalVotedData.account.state);
    console.log("OK voted proposal options: ", proposalVotedData.account.options);

    // max voting time in governance set to 1 seconds, we need to wait the time to pass and then we can finalize the proposal
    // NOTE: the test validator cannot be easily forced to move time forward from JS/TS code
    const maxWaitingLoop = 10;
    for (let i=0; i<=maxWaitingLoop; i++) {
      try {
        await sleep(500);
        const txFinalize = new TransactionEnvelope(solanaProvider, []);
        await withFinalizeVote(
          txFinalize.instructions,
          realm.splGovId,
          PROGRAM_VERSION_V3,
          realm.address,
          governanceData.pubkey,
          proposalData.pubkey,
          testUserTokenOwnerRecord.pubkey,
          coummunityMint.address,
          undefined,
        );
        await txFinalize.confirm();
        break; // no exception, the tx passed fine
      } catch (e) {
        console.log("Attempt to finalize #", i);
        // console.log(e);
        if (i >= maxWaitingLoop) throw e;
      }
    }

    const proposalFinalizedData = await getProposal(solanaProvider.connection, proposalPubkey);
    console.log("OK finalized proposal state: ", proposalFinalizedData.account.state);
    expect(proposalFinalizedData.account.state).toEqual(3); // Succeed == 3, Completed == 3; depends on proposal config of the useDenyOption
    console.log("OK finalized proposal options: ", proposalFinalizedData.account.options);
  });
});
