// @flow strict

import { expect } from 'chai';
import { describe, it } from 'mocha';

import isAsyncIterable from '../jsutils/isAsyncIterable';
import { graphql } from '../graphql';

import {
  StarWarsSchema,
  StarWarsSchemaDeferStreamEnabled,
} from './starWarsSchema';

describe('Star Wars Query Deferred Tests', () => {
  describe('Compatibility', () => {
    it('Should throw error if using @defer without enabling in the schema', async () => {
      const query = `
        query HeroNameQuery {
          hero {
            id
            ...NameFragment @defer(label: "NameFragment")
          }
        }
        fragment NameFragment on Droid {
          id
          name
        }
      `;
      const result = await graphql(StarWarsSchema, query);
      expect(result).to.deep.equal({
        errors: [
          {
            message: 'Unknown directive "@defer".',
            locations: [{ line: 5, column: 29 }],
          },
        ],
      });
    });
    it('Can disable @defer using if argument', async () => {
      const query = `
        query HeroNameQuery {
          hero {
            id
            ...NameFragment @defer(if: false, label: "NameFragment")
          }
        }
        fragment NameFragment on Droid {
          id
          name
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      expect(result).to.deep.equal({
        data: {
          hero: {
            id: '2001',
            name: 'R2-D2',
          },
        },
      });
    });
  });

  describe('Basic Queries', () => {
    it('Can @defer fragments containing scalar types', async () => {
      const query = `
        query HeroNameQuery {
          hero {
            id
            ...NameFragment @defer(label: "NameFragment")
          }
        }
        fragment NameFragment on Droid {
          id
          name
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }

      expect(patches).to.have.lengthOf(2);
      expect(patches).to.deep.equal([
        {
          data: {
            hero: {
              id: '2001',
            },
          },
          isFinal: false,
        },
        {
          label: 'NameFragment',
          path: ['hero'],
          data: {
            id: '2001',
            name: 'R2-D2',
          },
          isFinal: true,
        },
      ]);
    });

    it('Can defer a fragment on the top level Query field', async () => {
      const query = `
        query HeroNameQuery {
          ...QueryFragment @defer(label: "DeferQuery")
        }
        fragment QueryFragment on Query {
          hero {
            id
          }
        }
      `;

      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }

      expect(patches).to.have.lengthOf(2);
      expect(patches).to.deep.equal([
        {
          data: {},
          isFinal: false,
        },
        {
          label: 'DeferQuery',
          path: [],
          data: {
            hero: {
              id: '2001',
            },
          },
          isFinal: true,
        },
      ]);
    });
  });

  // TODO
  // describe('Nested Queries', () => {});

  describe('Nested Deferred Fragments', () => {
    it('Allows to us defer a fragment within an already deferred fragment', async () => {
      const query = `
        query HeroNameQuery {
          hero {
            id
            ...DroidFragment @defer(label: "DeferDroid")
          }
        }
        fragment DroidFragment on Droid {
          id
          name
          ...DroidNestedFragment @defer(label: "DeferNested")
        }
        fragment DroidNestedFragment on Droid {
          appearsIn
          primaryFunction
        }
      `;

      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }

      expect(patches).to.have.lengthOf(3);
      expect(patches).to.deep.equal([
        {
          data: {
            hero: {
              id: '2001',
            },
          },
          isFinal: false,
        },
        {
          label: 'DeferNested',
          path: ['hero'],
          data: {
            appearsIn: ['NEW_HOPE', 'EMPIRE', 'JEDI'],
            primaryFunction: 'Astromech',
          },
          isFinal: false,
        },
        {
          label: 'DeferDroid',
          path: ['hero'],
          data: {
            id: '2001',
            name: 'R2-D2',
          },
          isFinal: true,
        },
      ]);
    });
  });

  // TODO
  // describe('Using IDs and query parameters to refetch objects', () => {});

  // TODO
  // describe('Using aliases to change the key in the response', () => {});

  describe('Inline Fragments', () => {
    it('Allows us to defer an inline fragment', async () => {
      const query = `
        query UserFragment {
          human(id: "1003") {
            id
            ... on Human @defer(label: "InlineDeferred"){
              name
              homePlanet
            }
          }
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }
      expect(patches).to.have.lengthOf(2);
      expect(patches).to.deep.equal([
        {
          data: {
            human: {
              id: '1003',
            },
          },
          isFinal: false,
        },
        {
          label: 'InlineDeferred',
          path: ['human'],
          data: {
            name: 'Leia Organa',
            homePlanet: 'Alderaan',
          },
          isFinal: true,
        },
      ]);
    });
  });

  describe('Uses fragments to express more complex queries', () => {
    it('Allows us to use a fragment to avoid duplicating content', async () => {
      const query = `
        query UserFragment {
          leia: human(id: "1003") {
            __typename
            id
            ...HumanFragment
          }
          luke: human(id: "1000") {
            __typename
            id
            homePlanet
            ...HumanFragment @defer(label: "DeferLuke")
          }
          han: human(id: "1002") {
            id
            __typename
            name
            ...HumanFragment @defer(label: "DeferHan")
          }
        }

        fragment HumanFragment on Human {
          id
          __typename
          name
          homePlanet
          friends {
            name
          }
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }

      expect(patches).to.have.lengthOf(3);
      expect(patches).to.deep.equal([
        {
          data: {
            han: {
              __typename: 'Human',
              id: '1002',
              name: 'Han Solo',
            },
            luke: {
              id: '1000',
              __typename: 'Human',
              homePlanet: 'Tatooine',
            },
            leia: {
              __typename: 'Human',
              name: 'Leia Organa',
              homePlanet: 'Alderaan',
              id: '1003',
              friends: [
                {
                  name: 'Luke Skywalker',
                },
                {
                  name: 'Han Solo',
                },
                {
                  name: 'C-3PO',
                },
                {
                  name: 'R2-D2',
                },
              ],
            },
          },
          isFinal: false,
        },
        {
          label: 'DeferLuke',
          path: ['luke'],
          data: {
            id: '1000',
            __typename: 'Human',
            name: 'Luke Skywalker',
            homePlanet: 'Tatooine',
            friends: [
              {
                name: 'Han Solo',
              },
              {
                name: 'Leia Organa',
              },
              {
                name: 'C-3PO',
              },
              {
                name: 'R2-D2',
              },
            ],
          },
          isFinal: false,
        },
        {
          label: 'DeferHan',
          path: ['han'],
          data: {
            id: '1002',
            __typename: 'Human',
            name: 'Han Solo',
            homePlanet: null,
            friends: [
              {
                name: 'Luke Skywalker',
              },
              {
                name: 'Leia Organa',
              },
              {
                name: 'R2-D2',
              },
            ],
          },
          isFinal: true,
        },
      ]);
    });
  });

  // TODO
  // describe('Using __typename to find the type of an object', () => {});

  describe('Reporting errors raised in resolvers within deferred fragments', () => {
    it('Correctly reports error on accessing secretBackstory', async () => {
      const query = `
        query HeroNameQuery {
          hero {
            id
            ...SecretFragment @defer(label: "SecretFragment")
          }
        }
        fragment SecretFragment on Droid {
          name
          secretBackstory
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }
      expect(patches).to.have.lengthOf(2);
      expect(patches).to.deep.equal([
        {
          data: {
            hero: {
              id: '2001',
            },
          },
          isFinal: false,
        },
        {
          label: 'SecretFragment',
          path: ['hero'],
          data: {
            name: 'R2-D2',
            secretBackstory: null,
          },
          errors: [
            {
              message: 'secretBackstory is secret.',
              locations: [{ line: 10, column: 11 }],
              path: ['hero', 'secretBackstory'],
            },
          ],
          isFinal: true,
        },
      ]);
    });

    it('Correctly reports error on accessing secretBackstory in a list', async () => {
      const query = `
        query HeroNameQuery {
          hero {
            id
            ...SecretFriendsFragment @defer(label: "SecretFriendsFragment")
          }
        }
        fragment SecretFriendsFragment on Droid {
          id
          friends {
            name
            secretBackstory
          }
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }
      expect(patches).to.have.lengthOf(2);
      expect(patches).to.deep.equal([
        {
          data: {
            hero: {
              id: '2001',
            },
          },
          isFinal: false,
        },
        {
          label: 'SecretFriendsFragment',
          path: ['hero'],
          data: {
            id: '2001',
            friends: [
              {
                name: 'Luke Skywalker',
                secretBackstory: null,
              },
              {
                name: 'Han Solo',
                secretBackstory: null,
              },
              {
                name: 'Leia Organa',
                secretBackstory: null,
              },
            ],
          },
          errors: [
            {
              message: 'secretBackstory is secret.',
              locations: [
                {
                  line: 12,
                  column: 13,
                },
              ],
              path: ['hero', 'friends', 0, 'secretBackstory'],
            },
            {
              message: 'secretBackstory is secret.',
              locations: [
                {
                  line: 12,
                  column: 13,
                },
              ],
              path: ['hero', 'friends', 1, 'secretBackstory'],
            },
            {
              message: 'secretBackstory is secret.',
              locations: [
                {
                  line: 12,
                  column: 13,
                },
              ],
              path: ['hero', 'friends', 2, 'secretBackstory'],
            },
          ],
          isFinal: true,
        },
      ]);
    });

    it('Correctly reports error on accessing through an alias', async () => {
      const query = `
        query HeroNameQuery {
          mainHero: hero {
            name
            ...SecretFragment @defer(label: "SecretFragment")
          }
        }
        fragment SecretFragment on Droid {
            story: secretBackstory
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }
      expect(patches).to.have.lengthOf(2);
      expect(patches).to.deep.equal([
        {
          data: {
            mainHero: {
              name: 'R2-D2',
            },
          },
          isFinal: false,
        },
        {
          data: {
            story: null,
          },
          label: 'SecretFragment',
          errors: [
            {
              message: 'secretBackstory is secret.',
              locations: [{ line: 9, column: 13 }],
              path: ['mainHero', 'story'],
            },
          ],
          path: ['mainHero'],
          isFinal: true,
        },
      ]);
    });
    it('Correctly reports async error on accessing secretFiends', async () => {
      const query = `
        query HeroNameQuery {
          leia: human(id: "1003") {
            name
            ...SecretFragment @defer(label: "SecretFragment")
          }
        }
        fragment SecretFragment on Human {
          secretFriend
        }
      `;
      const result = await graphql(StarWarsSchemaDeferStreamEnabled, query);
      const patches = [];

      /* istanbul ignore else */
      if (isAsyncIterable(result)) {
        for await (const patch of result) {
          patches.push(patch);
        }
      }
      expect(patches).to.have.lengthOf(2);
      expect(patches).to.deep.equal([
        {
          data: {
            leia: {
              name: 'Leia Organa',
            },
          },
          isFinal: false,
        },
        {
          label: 'SecretFragment',
          path: ['leia'],
          data: {
            secretFriend: null,
          },
          errors: [
            {
              message: 'secretFriend is secret.',
              locations: [{ line: 9, column: 11 }],
              path: ['leia', 'secretFriend'],
            },
          ],
          isFinal: true,
        },
      ]);
    });
  });
});
