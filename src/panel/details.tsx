// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/* eslint-disable indent */ // Allowing for some custom intent under svDetailsGrid 2D layout.

import { autorun, computed, IObservableValue, observable } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Component } from 'react';
import ReactMarkdown from 'react-markdown';
import { Location, Result, StackFrame } from 'sarif';
import { parseArtifactLocation, parseLocation } from '../shared';
import './details.scss';
import './index.scss'
import { postSelectArtifact, postSelectLog } from './indexStore';
import { List, renderMessageWithEmbeddedLinks, Tab, TabPanel } from './widgets';

type TabName = 'Info' | 'Code Flows';

interface DetailsProps { result: Result, height: IObservableValue<number> }
@observer export class Details extends Component<DetailsProps> {
    private selectedTab = observable.box<TabName>('Info')
    @computed private get threadFlowLocations() {
		return this.props.result?.codeFlows?.[0]?.threadFlows?.[0].locations
			.map(threadFlowLocation => threadFlowLocation.location)
			.filter(locations => locations)
	}
    @computed private get stacks() {
        return this.props.result?.stacks
    }
    constructor(props: DetailsProps) {
        super(props);
        autorun(() => {
            const hasThreadFlows = !!this.threadFlowLocations?.length;
            this.selectedTab.set(hasThreadFlows ? 'Code Flows' : 'Info');
        });
    }
    render() {
        const renderRuleDesc = (desc?: { text: string, markdown?: string }) => {
            if (!desc) return '—';
            return desc.markdown
                ? <ReactMarkdown className="svMarkDown" source={desc.markdown} />
                : desc.text;
        };

        const {result, height} = this.props;
        const helpUri = result?._rule?.helpUri;
        const renderItem = (location: Location) => {
			const { message, uri, region } = parseLocation(result, location)
			return <>
				<div className="ellipsis">{message ?? '—'}</div>
				<div className="svSecondary">{uri?.file ?? '—'}</div>
				<div className="svLineNum">{region?.startLine}:1</div>
			</>
		}
		const renderStack = (stackFrame: StackFrame) => {
			const location = stackFrame.location
			const logicalLocation = stackFrame.location?.logicalLocations[0]
			const { message, uri, region } = parseLocation(result, location)
			const text = `${message ?? ''} ${logicalLocation?.fullyQualifiedName ?? ''}`
			return <>
				<div className="ellipsis">{text ?? '—'}</div>
				<div className="svSecondary">{uri?.file ?? '—'}</div>
				<div className="svLineNum">{region?.startLine}:1</div>
			</>
		}
        return <div className="svDetailsPane" style={{ height: height.get() }}>
            {result && <TabPanel selection={this.selectedTab}>
                <Tab name="Info">
                    <div className="svDetailsBody svDetailsInfo">
                        <div className="svDetailsMessage">
                            {result._markdown
                                ? <ReactMarkdown className="svMarkDown" source={result._markdown} escapeHtml={false} />
                                : renderMessageWithEmbeddedLinks(result, vscode.postMessage)}</div>
                        <div className="svDetailsGrid">
                            <span>Rule Id</span>			{helpUri ? <a href={helpUri} target="_blank" rel="noopener noreferrer">{result.ruleId}</a> : <span>{result.ruleId}</span>}
                            <span>Rule Name</span>			<span>{result._rule?.name ?? '—'}</span>
                            <span>Rule Desc Short</span>	<span>{renderRuleDesc(result._rule?.shortDescription)}</span>
                            <span>Rule Desc Full</span>		<span>{renderRuleDesc(result._rule?.fullDescription)}</span>
                            <span>Level</span>				<span>{result.level}</span>
                            <span>Kind</span>				<span>{result.kind ?? '—'}</span>
                            <span>Baseline State</span>		<span>{result.baselineState}</span>
                            <span>Locations</span>			<span>
                                                                {result.locations?.map((loc, i) => {
                                                                    const ploc = loc.physicalLocation;
                                                                    const [uri, _] = parseArtifactLocation(result, ploc?.artifactLocation);
                                                                    return <a key={i} href="#" className="ellipsis" title={uri}
                                                                        onClick={e => {
                                                                            e.preventDefault(); // Cancel # nav.
                                                                            postSelectArtifact(result, ploc);
                                                                        }}>
                                                                        {uri?.file ?? '-'}
                                                                    </a>;
                                                                }) ?? <span>—</span>}
                                                            </span>
                            <span>Log</span>				<a href="#" title={result._log._uri}
                                                                onClick={e => {
                                                                    e.preventDefault(); // Cancel # nav.
                                                                    postSelectLog(result);
                                                                }}>
                                                                {result._log._uri.file}{result._log._uriUpgraded && ' (upgraded)'}
                                                            </a>
                            {/* <span>Properties</span>		<span><pre><code>{JSON.stringify(selected.properties, null, '  ')}</code></pre></span> */}
                        </div>
                    </div>
                </Tab>
                <Tab name="Code Flows" count={this.threadFlowLocations?.length || 0}>
                    <div className="svDetailsBody svDetailsCodeflowAndStacks">
                        {(() => {
                            const items = this.threadFlowLocations;

                            const selection = observable.box(undefined as Location, { deep: false })
                            selection.observe(change => {
                                const location = change.newValue
                                postSelectArtifact(result, location?.physicalLocation)
                            })

                            return <List items={items} renderItem={renderItem} selection={selection} allowClear>
                                <span className="svSecondary">No code flows in selected result.</span>
                            </List>
                        })()}
                    </div>
                </Tab>
                <Tab name="Stacks" count={this.stacks?.length || 0}>
                    <div className="svDetailsBody">
                        {(() => {
                            if (!this.stacks?.length) 
                                return <div className="svZeroData">
                                    <span className="svSecondary">No stacks in selected result.</span>
                                </div>

                            return this.stacks.map(stack => {
                                const stackFrames = stack.frames

                                const selection = observable.box(undefined as Location, { deep: false })
                                selection.observe(change => {
                                    const location = change.newValue
                                    postSelectArtifact(result, location?.physicalLocation)
                                })
                                if (stack.message?.text) {
                                    return <div className="svStack">
                                        <div className="svStacksMessage">
                                            {stack?.message?.text}
                                        </div>
                                        <div className="svDetailsBody svDetailsCodeflowAndStacks">
                                            <List items={stackFrames} renderItem={renderStack} selection={selection} allowClear />
                                        </div>
                                    </div>
                                }
                            })
                        })()}
                    </div>
                </Tab>
            </TabPanel>}
        </div>;
    }
}
