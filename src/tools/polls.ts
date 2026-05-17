import { Api } from 'telegram';
import { z } from 'zod';
import bigInt from 'big-integer';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, parsePeer, safeStringify } from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  regWrite(
    'sendPoll',
    {
      title: 'Send a poll',
      description:
        'Send a poll. For a quiz, set `quiz: true` and `correctAnswerIndex` (0-based). ' +
        'Use `closePeriod` (seconds) or `closeDate` (unix seconds) to auto-close.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        question: z.string().min(1).max(255),
        answers: z.array(z.string().min(1).max(100)).min(2).max(10),
        anonymous: z.boolean().optional().default(true),
        multipleChoice: z.boolean().optional(),
        quiz: z.boolean().optional(),
        correctAnswerIndex: z.number().int().optional(),
        solution: z.string().optional().describe('Explanation shown after a quiz answer'),
        closePeriod: z.number().int().positive().optional(),
        closeDate: z.number().int().positive().optional(),
        replyTo: z.number().int().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const pollAnswers = (args.answers as string[]).map(
        (text, i) =>
          new Api.PollAnswer({
            text: new Api.TextWithEntities({ text, entities: [] }),
            option: Buffer.from([i]),
          })
      );
      const poll = new Api.Poll({
        id: bigInt(0),
        question: new Api.TextWithEntities({ text: args.question, entities: [] }),
        answers: pollAnswers,
        closed: false,
        publicVoters: args.anonymous === false,
        multipleChoice: args.multipleChoice,
        quiz: args.quiz,
        closePeriod: args.closePeriod,
        closeDate: args.closeDate,
      });
      const media = new Api.InputMediaPoll({
        poll,
        correctAnswers:
          args.quiz && args.correctAnswerIndex != null ? [Buffer.from([args.correctAnswerIndex])] : undefined,
        solution: args.solution,
        solutionEntities: args.solution ? [] : undefined,
      });
      const result: any = await client.invoke(
        new Api.messages.SendMedia({
          peer: inputPeer as any,
          media,
          message: '',
          randomId: bigInt(Date.now()),
          replyTo: args.replyTo ? new Api.InputReplyToMessage({ replyToMsgId: args.replyTo }) : undefined,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'votePoll',
    {
      title: 'Vote in a poll',
      description: 'Cast a vote on a poll by the index(es) of the chosen options.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageId: z.number().int(),
        answerIndexes: z.array(z.number().int().nonnegative()).min(1),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const options = (args.answerIndexes as number[]).map((i) => Buffer.from([i]));
      const result: any = await client.invoke(
        new Api.messages.SendVote({ peer: inputPeer as any, msgId: args.messageId, options })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'closePoll',
    {
      title: 'Close an active poll',
      description: 'Finalize a poll so no further votes are accepted.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), messageId: z.number().int() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const closedPoll = new Api.Poll({
        id: bigInt(0),
        question: new Api.TextWithEntities({ text: '', entities: [] }),
        answers: [],
        closed: true,
      });
      await client.invoke(
        new Api.messages.EditMessage({
          peer: inputPeer as any,
          id: args.messageId,
          media: new Api.InputMediaPoll({ poll: closedPoll }),
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  reg(
    'getPollResults',
    {
      title: 'Get poll results',
      description: 'Fetch the current vote tally for a poll message.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), messageId: z.number().int() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.messages.GetPollResults({ peer: inputPeer as any, msgId: args.messageId })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );
}
