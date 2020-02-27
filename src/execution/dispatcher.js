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
    this._data = [];
  }

  static apply(
    prevData: any,
    currPath: $ReadOnlyArray<string | number>,
    currData: any,
  ) {
    const [nextPath, ...rest] = currPath;
    let nextData = currData;
    let nextPrevData;

    if (rest && rest.length) {
      nextPrevData =
        prevData && prevData[nextPath] ? prevData[nextPath] : prevData;
      nextData = Dispatcher.apply(nextPrevData, rest, currData);
    }

    if (Array.isArray(prevData)) {
      prevData[nextPath] = {
        ...prevData[nextPath],
        ...nextData,
      };
      return prevData;
    }

    return {
      ...prevData,
      [nextPath]: nextData,
    };
  }

  static format(data, label, path, errors) {
    if (isPromise(data)) {
      return data.then(val => Dispatcher.format(val, label, path, errors));
    }
    return {
      value: {
        data,
        path: pathToArray(path),
        label,
        ...(errors && errors.length > 0 ? { errors } : {}),
      },
      done: false,
    };
  }

  add(
    label: string,
    path: Path | void,
    fn: () => PromiseOrValue<mixed>,
    errors: Array<GraphQLError>,
  ) {
    const data = fn();
    if (isPromise(data)) {
      this._patches.push(
        data.then(value => Dispatcher.format(data, label, path, errors)),
      );
    } else {
      this._data.push(Dispatcher.format(data, label, path, errors));
    }
  }

  getInitialResponse(response) {
    if (this._data.length === 0) {
      return response;
    }

    const ret = this._data.reduce((acc, { value }, index) => {
      const { data: currData, path, errors: currErrors } = value;
      const { data: prevData, errors: prevErrors } = acc;
      const data = Dispatcher.apply(prevData, path, currData);
      let errors = [];
      if (prevErrors) {
        errors = [errors, ...prevErrors];
      }
      if (currErrors) {
        errors = [errors, ...currErrors];
      }

      return errors.length === 0 ? { data } : { data, errors };
    }, response);
    return response;
  }

  getPatches(): AsyncIterable<ExecutionPatchResult> | null {
    if (this._patches.length === 0) {
      return null;
    }
    const results = this._patches;

    function race(promises) {
      return new Promise(resolve => {
        promises.forEach((promise, index) => {
          promise.then(result => {
            resolve({ result, index });
          });
        });
      });
    }

    const getNext = promises => {
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

  get(response): AsyncIterable<ExecutionPatchResult> | null {
    return {
      patches: this.getPatches(),
      initialResponse: this.getInitialResponse(response),
    };
  }
}

export type ExecutionPatchResult = {
  errors?: $ReadOnlyArray<GraphQLError>,
  data?: mixed | null,
  path: $ReadOnlyArray<string | number>,
  label: string,
  ...
};
