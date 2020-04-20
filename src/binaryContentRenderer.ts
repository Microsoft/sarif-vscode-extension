/*!
 * Copyright (c) Microsoft Corporation. All Rights Reserved.
 */

import * as nls from 'vscode-nls';
const localize: nls.LocalizeFunc = nls.loadMessageBundle();
import * as vscode from 'vscode';
import * as sarif from 'sarif';
import MarkdownIt = require("markdown-it");
import { Utilities } from './utilities';

/**
 * The purpose of this class is to transform artifact objects which have a "contents"
 * property set which contains "binary" content into markdown for user display.
 * Starting from the spec
 * https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html
 * An artifact can have "contents" property:
 * https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html#_Toc34317619
 * The artifact contents object can have many different types of rendering.
 * https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html#_Toc34317422
 * All of the content (with the exception of binary content) can be handed directly
 * to VSCode and the user display and "diagnostic/problem ranges" will work with no modifications.
 * Binary content, however, is a different story.
 * The goal of this "renderer" is to present a simply user view (using markdown)
 * that can be used with VSCode's diagnostics/problems.
 */

/**
 * Class used to render embedded binary content.
 */
export class BinaryContentRenderer {
    /**
     * Allows for overriding the number of bytes per row for the rendering of binary content.
     * Currently only used for testing.
     */
    public static bytesRenderedPerRowOverride: number | undefined;

    /**
     * The default number of bytes per row to render in the markdown.
     */
    private static defaultBytesRenderedPerRow: number = 8;

    /**
     * Stores the number of bytes per row to use for rendering.
     */
    private bytesRenderedPerRow: number;

    /**
     * The binary content rendered as markdown has 4 lines of markdown at the top.
     * # File <data.bin>
     * Total bytes 35
     * |Offset|0|1|2|Data|
     * |:---:|:---:|:---:|:---:|:---:|
     */
    private static headerRows: number = 4;

    /**
     * Markdown character used for table cell delimiter.
     */
    private static tableCellDelimiter: string = '|';
    private static tableCellDelimiterWidth: number = BinaryContentRenderer.tableCellDelimiter.length;

    /**
     * Characters used to render the contents of a hex byte.
     */
    private static hexNumberPrefix: string = localize("binaryContentRenderer.hexNumberPrefix", "0x");
    private static hexNumberPrefixWidth: number = BinaryContentRenderer.hexNumberPrefix.length;

    /**
     * Represents the maximum length of a hex byte.
     */
    private static hexNumberLength: number = 'ff'.length;

    /**
     * Represents the max width of hex byte (i.e. '|0xFF' )
     */
    private static contentWidthPerTableCell: number = BinaryContentRenderer.tableCellDelimiterWidth + BinaryContentRenderer.hexNumberPrefixWidth + BinaryContentRenderer.hexNumberLength;

    /**
     * The style used for the table cells. (Centered)
     */
    private static headerColumnStyle: string = ':---:';

    /**
     * The text used for the header.
     */
    private static offsetHeaderText: string = localize("binaryContentRenderer.offsetColumnHeader", "Offset");

    /**
     * Creates an instance of the binary content renderer.
     * @param content The string contents to be rendered as markdown.
     */
    private constructor(private readonly content: string) {
        this.bytesRenderedPerRow = BinaryContentRenderer.bytesRenderedPerRowOverride ?? vscode.workspace.getConfiguration(Utilities.configSection).get('binaryArtifactContent.bytesPerRow', BinaryContentRenderer.defaultBytesRenderedPerRow);
    }

    /**
     * Creates a header for binary content represented as mark down.
     * For a 16 bytes per row table, it generates this:
     * |Offset|0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|Data|
     * |:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
     */
    private createTableHeader(): string {
        // Start with the Offset column.
        const headerColumns: string[] = [BinaryContentRenderer.tableCellDelimiter, BinaryContentRenderer.offsetHeaderText];
        const headerTableDelimiters: string[] = [BinaryContentRenderer.tableCellDelimiter, BinaryContentRenderer.headerColumnStyle];

        // Create the table header and the header\row delimiter at the same time.
        for (let columnIndex: number = 0; columnIndex < this.bytesRenderedPerRow; columnIndex++) {
            headerColumns.push(BinaryContentRenderer.tableCellDelimiter);
            headerColumns.push(columnIndex.toString());

            headerTableDelimiters.push(BinaryContentRenderer.tableCellDelimiter);
            headerTableDelimiters.push(BinaryContentRenderer.headerColumnStyle);
        }

        // Add the data column to the header.
        headerColumns.push(BinaryContentRenderer.tableCellDelimiter);
        headerColumns.push(`${localize("binaryContentRenderer.dataColumnHeader", "Data")}`);
        headerColumns.push(BinaryContentRenderer.tableCellDelimiter);

        // Add the data column to the header\row delimiter.
        headerTableDelimiters.push(BinaryContentRenderer.tableCellDelimiter);
        headerTableDelimiters.push(BinaryContentRenderer.headerColumnStyle);
        headerTableDelimiters.push(BinaryContentRenderer.tableCellDelimiter);

        // Now join them all together.
        return `${headerColumns.join('')}\r\n${headerTableDelimiters.join('')}\r\n`;
    }

    private static valueAsHexDisplayString(value: number): string {
        const truncatedByte: number = Math.trunc(value);
        return `0x${truncatedByte < 16 ? '0' : ''}${truncatedByte.toString(16)}`;
    }

    /**
     * Attempts to create an instance of the binary content renderer based on a SARIF log, run index and artifact index
     * Returns undefined if the artifact contents cannot be found, or the content is not binary content.
     * @param log The SARIF log.
     * @param runIndex The run index.
     * @param artifactIndex The artifact index.
     */
    public static tryCreateFromLog(log: sarif.Log, runIndex: number, artifactIndex: number): BinaryContentRenderer | undefined {
        const run: sarif.Run | undefined = log.runs[runIndex];
        if (!run || !run.artifacts) {
            return undefined;
        }

        const artifact: sarif.Artifact | undefined = run.artifacts[artifactIndex];
        if (!(artifact?.contents?.binary)) {
            return undefined;
        }

        return new BinaryContentRenderer(artifact.contents.binary);
    }

    /**
     * Renders the contents as mark-down.
     * @param artifactUri The artifact URI to use as the file-name in the markdown.
     */
    public renderAsMarkdown(artifactUri: vscode.Uri): string {
        const markdownStrings: string[] = [];
        const mdIt: MarkdownIt = new MarkdownIt();
        const contentBuffer: Buffer = Buffer.from(this.content, 'base64');
        markdownStrings.push(localize("binaryContentRenderer.fileInfoHeader", "# File {0}\r\n", artifactUri.path));
        markdownStrings.push(localize("binaryContentRenderer.bytesColumnHeader", "Total bytes {0}\r\n", contentBuffer.length));
        markdownStrings.push(this.createTableHeader());

        // This is used as an index into the buffer for where the next
        // string representation of the data bytes will come from.
        const rowDataValues: number[] = [];

        for (let bufferIndex: number = 0; bufferIndex < contentBuffer.length; bufferIndex++) {
            const bufferByte: number = contentBuffer[bufferIndex];

            // Save the value for the data representation at the end of the row.
            rowDataValues.push(bufferByte);

            // When we hit the start of a new row, add the offset marker.
            if (bufferIndex % this.bytesRenderedPerRow === 0) {
                markdownStrings.push(BinaryContentRenderer.tableCellDelimiter);
                markdownStrings.push(BinaryContentRenderer.valueAsHexDisplayString(bufferIndex));
            }

            // Render the byte-value
            markdownStrings.push(BinaryContentRenderer.tableCellDelimiter);
            markdownStrings.push(BinaryContentRenderer.valueAsHexDisplayString(bufferByte));

            // If the next byte is a new row, or we are at the end of the content,
            // pad out the remaining cells in the table, add the data string representation
            // and finish off this row.
            const nextIndex: number = bufferIndex + 1;
            if (nextIndex % this.bytesRenderedPerRow === 0 || nextIndex === contentBuffer.length) {
                // Pad out the row of bytes if needed (happens at the end of the content)
                let bytePaddingIndex: number = nextIndex;
                while (bytePaddingIndex % this.bytesRenderedPerRow !== 0) {
                    markdownStrings.push(BinaryContentRenderer.tableCellDelimiter);
                    bytePaddingIndex++;
                }

                // Finish off the data bytes.
                markdownStrings.push(BinaryContentRenderer.tableCellDelimiter);

                // Add the data representation.
                // Covert the binary data into a string
                const dataString: string = rowDataValues.map((rowDataValue) => String.fromCharCode(rowDataValue)).join('').replace('\r', '-').replace('\n', '-');
                const mdText: string = mdIt.renderInline(dataString);
                markdownStrings.push(mdText);

                // This row is complete.
                markdownStrings.push(BinaryContentRenderer.tableCellDelimiter);
                markdownStrings.push('\r\n');

                // Clear the buffer out for the next row.
                rowDataValues.length = 0;
            }
        }

        return markdownStrings.join('');
    }

    /**
     * Computes a range from the binary content based on the markdown it will render.
     * Note that for speed, the buffer is not converted from base64 to a buffer
     * as if the buffer is very large, then the conversion can take some time
     * and when converting an offset and a length to a VSCode range, it actually
     * doesn't matter if the range is off the end of the document which works nicely for
     * this.
     * @param startOffset The start offset to compute the range from.
     * @param length The length of the desired range.
     */
    public rangeFromOffsetAndLength(startOffset: number, length: number): vscode.Range | undefined {
        if ((startOffset < 0) || (length < 1) || ((startOffset + length) < 0)) {
            return undefined;
        }

        let startRow: number = Math.trunc(startOffset / this.bytesRenderedPerRow);
        let startColumn: number = startOffset % this.bytesRenderedPerRow;

        // The end offset is not inclusive of the length.
        // A offset of 0 and length of 1, yields a start and end that are the same.
        const endOffset: number = (startOffset + length) - 1;
        let endRow: number = Math.trunc(endOffset / this.bytesRenderedPerRow);

        // We adjust the column by because a length of 1 doesn't mean
        // highlight nothing.
        let endColumn: number = (endOffset % this.bytesRenderedPerRow) + 1;

        // Offset by the known number of header rows in the markdown.
        startRow = startRow + BinaryContentRenderer.headerRows;
        endRow = endRow + BinaryContentRenderer.headerRows;

        // Now for the "fun" part.
        // We know that our column offset starts at "1" because of the table cell marker (|),
        // and that each value will take 4" bytes (0x00), and then the "offset" content we place.
        // To calculate the offset length, we need the number of hexadecimal digits (value/16) +
        // 2 for the '0x' string and then two more characters for the markdown table delimiter.
        const offsetMarkerDigits: number = startOffset < 16 ? 2 : Math.trunc((startOffset / 16));
        const offsetMarkerLength: number = offsetMarkerDigits + BinaryContentRenderer.hexNumberPrefixWidth + BinaryContentRenderer.tableCellDelimiterWidth;
        startColumn = startColumn * BinaryContentRenderer.contentWidthPerTableCell + offsetMarkerLength + BinaryContentRenderer.tableCellDelimiterWidth;
        endColumn = endColumn * BinaryContentRenderer.contentWidthPerTableCell + offsetMarkerLength;

        return new vscode.Range(startRow, startColumn, endRow, endColumn);
    }
}
