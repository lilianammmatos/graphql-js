// @flow strict

import { expect } from 'chai';
import { describe, it } from 'mocha';

import { parse } from '../../language/parser';

import { GraphQLInt } from '../../type/scalars';
import { GraphQLSchema } from '../../type/schema';
import { GraphQLObjectType } from '../../type/definition';

import { execute } from '../execute';

class NumberHolder {
  theNumber: number;

  constructor(originalNumber: number) {
    this.theNumber = originalNumber;
  }
}

class Root {
  numberHolder: NumberHolder;

  constructor(originalNumber: number) {
    this.numberHolder = new NumberHolder(originalNumber);
  }

  immediatelyChangeTheNumber(newNumber: number): NumberHolder {
    this.numberHolder.theNumber = newNumber;
    return this.numberHolder;
  }

  promiseToChangeTheNumber(newNumber: number): Promise<NumberHolder> {
    return new Promise((resolve) => {
      process.nextTick(() => {
        resolve(this.immediatelyChangeTheNumber(newNumber));
      });
    });
  }

  failToChangeTheNumber(): NumberHolder {
    throw new Error('Cannot change the number');
  }

  promiseAndFailToChangeTheNumber(): Promise<NumberHolder> {
    return new Promise((_resolve, reject) => {
      process.nextTick(() => {
        reject(new Error('Cannot change the number'));
      });
    });
  }
}

const numberHolderType = new GraphQLObjectType({
  fields: {
    theNumber: { type: GraphQLInt },
    promiseToGetTheNumber: {
      type: GraphQLInt,
      resolve: (root) =>
        new Promise((resolve) => {
          process.nextTick(() => {
            resolve(root.theNumber);
          });
        }),
    },
  },
  name: 'NumberHolder',
});

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    fields: {
      numberHolder: { type: numberHolderType },
    },
    name: 'Query',
  }),
  mutation: new GraphQLObjectType({
    fields: {
      immediatelyChangeTheNumber: {
        type: numberHolderType,
        args: { newNumber: { type: GraphQLInt } },
        resolve(obj, { newNumber }) {
          return obj.immediatelyChangeTheNumber(newNumber);
        },
      },
      promiseToChangeTheNumber: {
        type: numberHolderType,
        args: { newNumber: { type: GraphQLInt } },
        resolve(obj, { newNumber }) {
          return obj.promiseToChangeTheNumber(newNumber);
        },
      },
      failToChangeTheNumber: {
        type: numberHolderType,
        args: { newNumber: { type: GraphQLInt } },
        resolve(obj, { newNumber }) {
          return obj.failToChangeTheNumber(newNumber);
        },
      },
      promiseAndFailToChangeTheNumber: {
        type: numberHolderType,
        args: { newNumber: { type: GraphQLInt } },
        resolve(obj, { newNumber }) {
          return obj.promiseAndFailToChangeTheNumber(newNumber);
        },
      },
    },
    name: 'Mutation',
  }),
  experimentalDefer: true,
});

describe('Execute: Handles mutation execution ordering', () => {
  it('evaluates mutations serially', async () => {
    const document = parse(`
      mutation M {
        first: immediatelyChangeTheNumber(newNumber: 1) {
          theNumber
        },
        second: promiseToChangeTheNumber(newNumber: 2) {
          theNumber
        },
        third: immediatelyChangeTheNumber(newNumber: 3) {
          theNumber
        }
        fourth: promiseToChangeTheNumber(newNumber: 4) {
          theNumber
        },
        fifth: immediatelyChangeTheNumber(newNumber: 5) {
          theNumber
        }
      }
    `);

    const rootValue = new Root(6);
    const mutationResult = await execute({ schema, document, rootValue });

    expect(mutationResult).to.deep.equal({
      data: {
        first: { theNumber: 1 },
        second: { theNumber: 2 },
        third: { theNumber: 3 },
        fourth: { theNumber: 4 },
        fifth: { theNumber: 5 },
      },
    });
  });

  it('does not include illegal mutation fields in output', () => {
    const document = parse('mutation { thisIsIllegalDoNotIncludeMe }');

    const result = execute({ schema, document });
    expect(result).to.deep.equal({
      data: {},
    });
  });

  it('evaluates mutations correctly in the presence of a failed mutation', async () => {
    const document = parse(`
      mutation M {
        first: immediatelyChangeTheNumber(newNumber: 1) {
          theNumber
        },
        second: promiseToChangeTheNumber(newNumber: 2) {
          theNumber
        },
        third: failToChangeTheNumber(newNumber: 3) {
          theNumber
        }
        fourth: promiseToChangeTheNumber(newNumber: 4) {
          theNumber
        },
        fifth: immediatelyChangeTheNumber(newNumber: 5) {
          theNumber
        }
        sixth: promiseAndFailToChangeTheNumber(newNumber: 6) {
          theNumber
        }
      }
    `);

    const rootValue = new Root(6);
    const result = await execute({ schema, document, rootValue });

    expect(result).to.deep.equal({
      data: {
        first: { theNumber: 1 },
        second: { theNumber: 2 },
        third: null,
        fourth: { theNumber: 4 },
        fifth: { theNumber: 5 },
        sixth: null,
      },
      errors: [
        {
          message: 'Cannot change the number',
          locations: [{ line: 9, column: 9 }],
          path: ['third'],
        },
        {
          message: 'Cannot change the number',
          locations: [{ line: 18, column: 9 }],
          path: ['sixth'],
        },
      ],
    });
  });
  it('Mutation fields with @defer do not block next mutation', async () => {
    const document = parse(`
      mutation M {
        first: promiseToChangeTheNumber(newNumber: 1) {
          ...DeferFragment @defer(label: "defer-label")
        },
        second: immediatelyChangeTheNumber(newNumber: 2) {
          theNumber
        }
      }
      fragment DeferFragment on NumberHolder {
        promiseToGetTheNumber
      }
    `);

    const rootValue = new Root(6);
    const mutationResult = await execute({ schema, document, rootValue });
    const { patches: patchesIterable, ...initial } = mutationResult;

    const patches = [];

    /* istanbul ignore else - test will fail if patches is undefined */
    if (patchesIterable) {
      for await (const patch of patchesIterable) {
        patches.push(patch);
      }
    }

    expect(initial).to.deep.equal({
      data: {
        first: {},
        second: { theNumber: 2 },
      },
      is_final: false,
    });
    expect(patches).to.deep.equal([
      {
        label: 'defer-label',
        path: ['first'],
        data: {
          promiseToGetTheNumber: 2,
        },
        is_final: true,
      },
    ]);
  });
  it('Mutation inside of a fragment', async () => {
    const document = parse(`
      mutation M {
        ...MutationFragment
        second: immediatelyChangeTheNumber(newNumber: 2) {
          theNumber
        }
      }
      fragment MutationFragment on Mutation {
        first: promiseToChangeTheNumber(newNumber: 1) {
          theNumber
        },
      }
    `);

    const rootValue = new Root(6);
    const mutationResult = await execute({ schema, document, rootValue });

    expect(mutationResult).to.deep.equal({
      data: {
        first: { theNumber: 1 },
        second: { theNumber: 2 },
      },
    });
  });
  it('Mutation with @defer is not executed serially', async () => {
    const document = parse(`
      mutation M {
        ...MutationFragment @defer(label: "defer-label")
        second: immediatelyChangeTheNumber(newNumber: 2) {
          theNumber
        }
      }
      fragment MutationFragment on Mutation {
        first: promiseToChangeTheNumber(newNumber: 1) {
          theNumber
        },
      }
    `);

    const rootValue = new Root(6);
    const mutationResult = await execute({ schema, document, rootValue });
    const { patches: patchesIterable, ...initial } = mutationResult;

    const patches = [];

    /* istanbul ignore else - test will fail if patches is undefined */
    if (patchesIterable) {
      for await (const patch of patchesIterable) {
        patches.push(patch);
      }
    }

    expect(initial).to.deep.equal({
      data: {
        second: { theNumber: 2 },
      },
      is_final: false,
    });
    expect(patches).to.deep.equal([
      {
        label: 'defer-label',
        path: [],
        data: {
          first: {
            theNumber: 1,
          },
        },
        is_final: true,
      },
    ]);
  });
});
