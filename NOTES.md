1. fetch getRemoteAccount
2. fetch balance
3. perform tx to add to balance (can be part of a commit in a commit-reveal scheme)
4. construct tx data (reveal tx)
5. submit scheduling, including chainId and derivation parameters: (publicKey, [accountContractClassHash])
