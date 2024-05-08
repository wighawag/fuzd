---
outline: deep
---

::: warning

Both the documentation and the api are work in progress

If anything feels wrong, do not hesitate to provide your feedback on our github repo: https://github.com/wighawag/fuzd/ so we can improve before first release

:::

# FUZD

## FUZD packages

FUZD is built as a set of packages:

### fuzd-scheduler

This is the package that perform the delayed execution and decrypt the payload when possible. It then defers execution to an execution api

### fuzd-executor

This is a execution api provided as part of FUZD, that make use of a very simple mechanism to perform execution on behalf of ethereum account

### fuzd-common

This is a commin library used by the other fuzd-packages

### fuzd-tlock-decrypter

This package allow to accept Drand encrypted payload and decrypt them as transaction to be executed

### fuzd-gateways

## Auxiliary Packages

There is also auxiliary packages you ll find in this repo:

### remote-account

This package provide a mechanism by which a remote-account can be controlled by a local account. Used by the fuzd-executor to perform paid tx.

## FUZD platforms

FUZD can run on any platform that support javascript. FUZD aims to provide basic setup for some

### fuzd-cf-worker

This package provide a basic implementation of FUZD api as a cloudflare worker.

It provided both the scheduler and execution api
