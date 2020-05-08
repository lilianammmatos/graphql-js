// @flow strict

import { SYMBOL_ASYNC_ITERATOR } from '../polyfills/symbols';

import { type Path, pathToArray } from '../jsutils/Path';
import { type PromiseOrValue } from '../jsutils/PromiseOrValue';
import isPromise from '../jsutils/isPromise';

import { GraphQLError } from '../error/GraphQLError';

export class Dispatcher {
  _patches: Array<Promise<{| value: ExecutionPatchResult, done: boolean |}>>;

  constructor() {
    this._patches = [];
  }

  execute(fn: () => PromiseOrValue<mixed>): Promise<mixed> {
    const data = fn();
    if (isPromise(data)) {
      return data;
    }
    return Promise.resolve(data);
  }

  add(
    label: string,
    path: Path | void,
    fn: () => PromiseOrValue<mixed>,
    errors: Array<GraphQLError>,
  ) {
    this._patches.push(
      this.execute(fn).then((data) => ({
        value: {
          data,
          path: pathToArray(path),
          label,
          ...(errors && errors.length > 0 ? { errors } : {}),
        },
        done: false,
      })),
    );
  }

  get(): AsyncIterable<ExecutionPatchResult> | null {
    if (this._patches.length === 0) {
      return null;
    }
    const results = this._patches;

    function race(promises) {
      const isFinal = promises.length === 1;
      return new Promise((resolve) => {
        promises.forEach((promise, index) => {
          promise.then((result) => {
            resolve({
              result: {
                ...result,
                value: {
                  ...result.value,
                  isFinal,
                },
              },
              index,
            });
          });
        });
      });
    }

    const getNext = (promises) => {
      if (promises.length === 0) {
        return Promise.resolve({ value: undefined, done: true });
      }
      return race(promises).then(({ result, index }) => {
        promises.splice(index, 1);
        return result;
      });
    };

    return ({
      next() {
        return getNext(results);
      },
      [SYMBOL_ASYNC_ITERATOR]() {
        return this;
      },
    }: any);
  }
}

export type ExecutionPatchResult = {
  errors?: $ReadOnlyArray<GraphQLError>,
  data?: mixed | null,
  path: $ReadOnlyArray<string | number>,
  label: string,
  isFinal?: boolean,
  ...
};
