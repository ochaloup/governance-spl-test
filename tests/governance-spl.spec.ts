import * as anchor from '@project-serum/anchor';
import {Program} from '@project-serum/anchor';
import {GovernanceSplTests} from '../target/types/governance_spl_tests';

describe('governance-spl-tests', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .GovernanceSplTests as Program<GovernanceSplTests>;

  it('Is initialized!', async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log('Your transaction signature', tx);
  });
});
