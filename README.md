# fuzd

FUZD allows users to schedule and execute transactions in the future without the server knowing their content until execution time. It supports encrypted transactions using [Drand](drand.love) and is modular, supporting multiple execution engines and decryption systems. The project currently supports both Starknet and EVM chains.

## Blindfolded Execution

fuzd allow you to execute transactions in the futire without knowing their content until execution time

### Execute Transaction in The Future

User can specify a specific time at which the tx need to be executed

### Transactions are encrypted

They remain encrypted until execution time using [drand](drand.love)

### Modular

You can switch the execution engine or even the decryption system. Support any chain. Currently Starknet and EVM.
