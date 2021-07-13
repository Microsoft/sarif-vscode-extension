// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// Exceptions to make mocking easier.
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

/// <reference path="../panel/global.d.ts" />

import { IndexStore } from './indexStore';
import { filtersColumn, filtersRow } from '../shared';
import { Log } from 'sarif';
import assert from 'assert';
import { RowItem } from './tableStore';

describe('IndexStore', () => {
    before('before all', () => {
        const log = {
            version: '2.1.0',
            runs: [{
                tool: {
                    driver: { name: 'Driver' }
                },
                results: [{
                    message: {
                        text: 'Message 1'
                    },
                    locations: [{
                        physicalLocation: {
                            artifactLocation: {
                                uri: 'file:///c%3A/Users/muraina/sarif-tutorials/samples/results.sarif',
                            },
                            region: {
                                startLine: 28,
                            },
                        }
                    }]
                }]
            }]
        } as Log;
        global.fetch = async () => ({ json: async () => log }) as unknown as Promise<Response>;
        global.vscode = {
            postMessage: async () => {}
        };
    });
    it('keep logs in sync', async () => {
        const indexStore = new IndexStore({filtersRow, filtersColumn});
        // Adds a new log
        await indexStore.onMessage({ data: {
            'command': 'spliceLogs',
            'removed': [],
            'added': [{
                'uri':'file:///c%3A/Users/muraina/sarif-tutorials/samples/results.sarif',
                'webviewUri':'vscode-webview-resource://bd904178-42ae-4a87-aa8f-a4f14965f103/file///c%3A/Users/muraina/sarif-tutorials/samples/results.sarif'
            }]
        }} as any);
        assert.strictEqual(indexStore.results.length, 1);
        assert.strictEqual(indexStore.results[0]._uri, 'file:///c:/Users/muraina/sarif-tutorials/samples/results.sarif');

        // Removes an existing log
        await indexStore.onMessage({ data: {
            'command': 'spliceLogs',
            'removed': ['file:///c%3A/Users/muraina/sarif-tutorials/samples/results.sarif'],
            'added': []
        }} as any);
        assert.strictEqual(indexStore.results.length, 0);

        // Does not fail if log does not exist
        assert.doesNotThrow(() => indexStore.onMessage({ data: {
            'command': 'spliceLogs',
            'removed': ['file:///c%3A/Users/muraina/sarif-tutorials/samples/results.sarif'],
            'added': []
        }} as any));
    });
    it('updates the current selection', async () => {
        const indexStore = new IndexStore({filtersRow, filtersColumn});
        // Case 1: Selects a result
        await indexStore.onMessage({ data: {
            'command': 'spliceLogs',
            'removed': [],
            'added': [{
                'uri':'file:///c%3A/Users/muraina/sarif-tutorials/samples/results.sarif',
                'webviewUri':'vscode-webview-resource://bd904178-42ae-4a87-aa8f-a4f14965f103/file///c%3A/Users/muraina/sarif-tutorials/samples/results.sarif'
            }]
        }} as any);
        await indexStore.onMessage({
            data: {
                'command':'select',
                'id':['file:///c%3A/Users/muraina/sarif-tutorials/samples/results.sarif',0,0]
            }
        } as any);
        assert.strictEqual((indexStore.selection.get() as RowItem<any>).item._uri, 'file:///c:/Users/muraina/sarif-tutorials/samples/results.sarif');
        // Case 2: De-selects a result
        await indexStore.onMessage({
            data: {
                'command':'select',
                'id': undefined
            }
        } as any);
        assert.strictEqual(indexStore.selection.get() as RowItem<any>, undefined);
    });

    after('after all', () => {
        delete global.vscode;
    });
});