// @flow strict

import { forAwaitEach, isAsyncIterable, getAsyncIterator } from 'iterall';
import { expect } from 'chai';
import { describe, it } from 'mocha';

import { graphql } from '../graphql';

import {
  StarWarsSchema,
  StarWarsSchemaDeferStreamEnabled,
} from './starWarsSchema';

describe('Star Wars Query Deferred Tests', () => {
  describe('Compatibility', () => {
    it('Can disable @defer and return would-be deferred data as part of initial result', () => {
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
      const result = graphql(StarWarsSchema, query);
      expect(isAsyncIterable(result)).to.equal(false);
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

      const result = graphql(StarWarsSchemaDeferStreamEnabled, query);

      expect(isAsyncIterable(result)).to.equal(true);
      const iterator = getAsyncIterator(result);
      const results = [];
      if (iterator) {
        await forAwaitEach(iterator, patch => {
          results.push(patch);
        });
      }
      expect(results).to.have.lengthOf(2);
      expect(results[0]).to.deep.equal({
        data: {
          hero: {
            id: '2001',
          },
        },
      });

      expect(results[1]).to.deep.equal({
        label: 'NameFragment',
        path: ['hero'],
        data: {
          id: '2001',
          name: 'R2-D2',
        },
      });
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

      const result = graphql(StarWarsSchemaDeferStreamEnabled, query);

      expect(isAsyncIterable(result)).to.equal(true);
      const iterator = getAsyncIterator(result);
      const results = [];
      if (iterator) {
        await forAwaitEach(iterator, patch => {
          results.push(patch);
        });
      }

      expect(results).to.have.lengthOf(3);

      expect(results[0]).to.deep.equal({
        data: {
          hero: {
            id: '2001',
          },
        },
      });

      expect(results[1]).to.deep.equal({
        label: 'DeferNested',
        path: ['hero'],
        data: {
          appearsIn: ['NEW_HOPE', 'EMPIRE', 'JEDI'],
          primaryFunction: 'Astromech',
        },
      });
      expect(results[2]).to.deep.equal({
        label: 'DeferDroid',
        path: ['hero'],
        data: {
          id: '2001',
          name: 'R2-D2',
        },
      });
    });
  });

  // TODO
  // describe('Using IDs and query parameters to refetch objects', () => {});

  // TODO
  // describe('Using aliases to change the key in the response', () => {});

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
      const result = graphql(StarWarsSchemaDeferStreamEnabled, query);

      expect(isAsyncIterable(result)).to.equal(true);
      const iterator = getAsyncIterator(result);
      const results = [];
      if (iterator) {
        await forAwaitEach(iterator, patch => {
          results.push(patch);
        });
      }
      expect(results).to.have.lengthOf(3);

      expect(results[0]).to.deep.equal({
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
      });

      expect(results[1]).to.deep.equal({
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
      });

      expect(results[2]).to.deep.equal({
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
      });
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
      const result = graphql(StarWarsSchemaDeferStreamEnabled, query);

      expect(isAsyncIterable(result)).to.equal(true);
      const iterator = getAsyncIterator(result);
      const results = [];
      if (iterator) {
        await forAwaitEach(iterator, patch => {
          results.push(patch);
        });
      }
      expect(results).to.have.lengthOf(2);

      expect(results[0]).to.deep.equal({
        data: {
          hero: {
            id: '2001',
          },
        },
      });

      expect(results[1]).to.deep.equal({
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
      });
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
      const result = graphql(StarWarsSchemaDeferStreamEnabled, query);

      expect(isAsyncIterable(result)).to.equal(true);
      const iterator = getAsyncIterator(result);
      const results = [];
      if (iterator) {
        await forAwaitEach(iterator, patch => {
          results.push(patch);
        });
      }
      expect(results).to.have.lengthOf(2);

      expect(results[0]).to.deep.equal({
        data: {
          hero: {
            id: '2001',
          },
        },
      });

      expect(results[1]).to.deep.equal({
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
      });
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
      const result = graphql(StarWarsSchemaDeferStreamEnabled, query);

      expect(isAsyncIterable(result)).to.equal(true);
      const iterator = getAsyncIterator(result);
      const results = [];
      if (iterator) {
        await forAwaitEach(iterator, patch => {
          results.push(patch);
        });
      }
      expect(results).to.have.lengthOf(2);

      expect(results[0]).to.deep.equal({
        data: {
          mainHero: {
            name: 'R2-D2',
          },
        },
      });

      expect(results[1]).to.deep.equal({
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
      });
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
      const result = graphql(StarWarsSchemaDeferStreamEnabled, query);

      expect(isAsyncIterable(result)).to.equal(true);
      const iterator = getAsyncIterator(result);
      const results = [];
      if (iterator) {
        await forAwaitEach(iterator, patch => {
          results.push(patch);
        });
      }
      expect(results).to.have.lengthOf(2);

      expect(results[0]).to.deep.equal({
        data: {
          leia: {
            name: 'Leia Organa',
          },
        },
      });

      expect(results[1]).to.deep.equal({
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
      });
    });
  });
});
