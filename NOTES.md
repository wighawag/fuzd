- assignerID need to be public so client can predict the account
- add derivation for starknet account
- do we keep using ethereum addresses as account (used for signing requests)

```
const masterHD = HDKey
const publicOnlyKey = HDKey.fromExtendedKey(masterHD.publicExtendedKey);
const derivedHD = publicOnlyKey.derive(path);
```

else get rid of public derivation

when submiting an execution, you also provide the parameters (public_key for etherem. public_key+contract_class for starknet)
these parameters are then checked

You should also provide for scheduling too, im that case, the executor should accept such parameter as old as the scheduling was done.

In order for the client to know valid parameters we need a function `getRemoteAccount` which will return the parameters + the remote-account address.

Similary when asking for balance or other account related param, the remote-account address

SO

1. fetch getRemoteAccount
2. fetch balance
3. construct tx data
4. submit scheduling, including chainId and parameters: (publicKey, [accountContractClassHash])
