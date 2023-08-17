---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  # name: 'Blindfolded Execution'
  text: Blindfolded Execution
  # text: 'Execute Delayed Transactions Without Knowing Their Content Until Execution Time'
  tagline: 'Execute Delayed Transactions Without Knowing Their Content Until Execution Time'
  # tagline: FUZD allow you to provide delayed execution to your users / players. It does that without you being able to see the data to be executed until it is time to execute.
  image:
    dark: /logo-white.svg
    light: /logo.svg
    alt: FUZD logo
  actions:
    - theme: brand
      text: Examples
      link: /examples
    - theme: alt
      text: Repo
      link: https://github.com/wighawag/fuzd

features:
  - title: Execute Transaction in The Future
    details: User can specify a specific time at which the tx need to be executed
  - title: Transactions are encrypted
    details: They remain encrypted until execution time using Drand
  - title: Modular
    details: You can switch the execution engine or even the decryption system
---