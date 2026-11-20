# Security

Asteme keeps a person's memory on their own machine. A way to read it, change it or send it elsewhere without their say is the most serious thing that can be wrong with it.

## Reporting

Please do not open a public issue for a security problem. Use GitHub's private reporting ("Report a vulnerability" under the repository's Security tab). Say what you found, how to see it, and what version.

You will get an answer within a few days. A fix is released before the details are made public, and you are credited unless you would rather not be.

## What is in scope

- Anything that lets another program, page or person read or change the store, the files kept beside it, or the conversation.
- Anything that sends what is remembered somewhere the settings do not say.
- The page served to this computer: its token, what it will answer to, what it will run.

## What is known and not a vulnerability

- The model that is configured is sent what it needs to answer: the message, recent turns, and the memories called up for it. That is what a model is for; which model is the user's choice.
- A lent voice is sent the words it reads.
- Anyone with access to the user's account on the machine can read the store. It is a file.
