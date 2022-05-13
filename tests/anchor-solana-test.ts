import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { AnchorSolanaTest } from "../target/types/anchor_solana_test";
import * as assert from "assert";
import * as bs58 from "bs58";

describe("anchor-solana-test", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .AnchorSolanaTest as Program<AnchorSolanaTest>;

  it("can send a new tweet", async () => {
    const tweet = anchor.web3.Keypair.generate();
    await program.methods
      .sendTweet("veganism", "Hummus, am I right?")
      .accounts({
        tweet: tweet.publicKey,
        author: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([tweet])
      .rpc();

    const tweetAccount = await program.account.tweet.fetch(tweet.publicKey);

    assert.equal(
      tweetAccount.author.toBase58(),
      provider.wallet.publicKey.toBase58()
    );
    assert.equal(tweetAccount.topic, "veganism");
    assert.equal(tweetAccount.content, "Hummus, am I right?");
    assert.ok(tweetAccount.timestamp);
  });

  it("can send a new tweet without a topic", async () => {
    const tweet = anchor.web3.Keypair.generate();
    await program.methods
      .sendTweet("", "gm")
      .accounts({
        tweet: tweet.publicKey,
        author: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([tweet])
      .rpc();

    const tweetAccount = await program.account.tweet.fetch(tweet.publicKey);

    assert.equal(
      tweetAccount.author.toBase58(),
      provider.wallet.publicKey.toBase58()
    );
    assert.equal(tweetAccount.topic, "");
    assert.equal(tweetAccount.content, "gm");
    assert.ok(tweetAccount.timestamp);
  });

  it("can send a new tweet from a different author", async () => {
    const otherUser = anchor.web3.Keypair.generate();
    const tweet = anchor.web3.Keypair.generate();

    const signature = await provider.connection.requestAirdrop(
      otherUser.publicKey,
      1000000000
    );
    await provider.connection.confirmTransaction(signature);

    await program.methods
      .sendTweet("veganism", "Yay Tofu!")
      .accounts({
        tweet: tweet.publicKey,
        author: otherUser.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([otherUser, tweet])
      .rpc();

    const tweetAccount = await program.account.tweet.fetch(tweet.publicKey);

    assert.equal(
      tweetAccount.author.toBase58(),
      otherUser.publicKey.toBase58()
    );
    assert.equal(tweetAccount.topic, "veganism");
    assert.equal(tweetAccount.content, "Yay Tofu!");
    assert.ok(tweetAccount.timestamp);
  });

  it("cannot provide a topic with more than 50 characters", async () => {
    try {
      const tweet = anchor.web3.Keypair.generate();
      const topicWith51Chars = "x".repeat(51);
      await program.methods
        .sendTweet(topicWith51Chars, "Hummus, am I right?")
        .accounts({
          tweet: tweet.publicKey,
          author: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([tweet])
        .rpc();
    } catch (err) {
      assert.equal(
        err.error.errorMessage,
        "The provided topic should be 50 characters long maximum."
      );
      return;
    }

    assert.fail("The instruction should have failed with a 51-character topic");
  });

  it("cannot provide a content with more than 280 characters", async () => {
    try {
      const tweet = anchor.web3.Keypair.generate();
      const contentWith281Chars = "x".repeat(281);
      await program.methods
        .sendTweet("veganism", contentWith281Chars)
        .accounts({
          tweet: tweet.publicKey,
          author: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([tweet])
        .rpc();
    } catch (err) {
      assert.equal(
        err.error.errorMessage,
        "The provided content should be 280 characters long maximum."
      );
      return;
    }

    assert.fail(
      "The instruction should have failed with a 281-character content"
    );
  });

  it("can fetch all tweets", async () => {
    const tweetAccounts = await program.account.tweet.all();
    assert.equal(tweetAccounts.length, 3);
  });

  it("can filter tweets by author", async () => {
    const authorPublicKey = provider.wallet.publicKey;
    const tweetAccounts = await program.account.tweet.all([
      {
        memcmp: {
          offset: 8,
          bytes: authorPublicKey.toBase58(),
        },
      },
    ]);
    assert.equal(tweetAccounts.length, 2);
    assert.ok(
      tweetAccounts.every((tweetAccount) => {
        return (
          tweetAccount.account.author.toBase58() === authorPublicKey.toBase58()
        );
      })
    );
  });

  it("can filter tweets by topics", async () => {
    const tweetAccounts = await program.account.tweet.all([
      {
        memcmp: {
          offset: 8 + 32 + 8 + 4,
          bytes: bs58.encode(Buffer.from("veganism")),
        },
      },
    ]);
    assert.equal(tweetAccounts.length, 2);
    assert.ok(
      tweetAccounts.every((tweetAccount) => {
        return tweetAccount.account.topic === "veganism";
      })
    );
  });
});
