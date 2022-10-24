import * as anchor from '@project-serum/anchor';
import {Program} from '@project-serum/anchor';
import {GovernanceSplTests} from '../target/types/governance_spl_tests';
// TODO: RealmHelper needs to be exported by @marinade.finance/solana-test-utils
// import {RealmHelper} from '@marinade.finance/solana-test-utils'

import { Keypair } from '@solana/web3.js';
// import { KeypairSignerHelper } from '@marinade.finance/solana-test-utils';
import  { KeypairSignerHelper  } from '../node_modules/@marinade.finance/solana-test-utils/signer'

describe('governance-spl-tests', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .GovernanceSplTests as Program<GovernanceSplTests>;

  it('Is initialized!', async () => {
    // Add your test here.
    // const tx = await program.methods.initialize().rpc();
    // console.log('Your transaction signature', tx);
    const owner = new KeypairSignerHelper(Keypair.generate());
    console.log("OK", owner)
  });
});
