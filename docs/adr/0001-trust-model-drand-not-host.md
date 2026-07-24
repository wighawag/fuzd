# Trust model: users trust Drand, not the fuzd host

fuzd is designed so users do not have to trust the server running fuzd with the content of their scheduled transactions; they only need to trust the Drand nodes for the timelock. Payloads stay encrypted (Drand timelock) until execution time, so the strongest thing a malicious or faulty host can do is refuse to execute or delay execution: it can never read or alter the transaction content ahead of time. This is why encryption is anchored on Drand rather than on any host-held key or host-controlled reveal: without Drand, confidentiality would not even be achievable, because the host would inherently hold the payload and users would be reduced to trusting it not to sell or leak the content to third parties.

## Consequences

- Liveness (execute on time) is a host responsibility and NOT guaranteed by the trust model; delay/non-execution is the residual power a host retains. Crucially that power is VISIBLE and PROVABLE (anyone can observe that a due execution did not happen), unlike payload leakage, which would be silent. Confidentiality and integrity of the payload do not depend on the host.
