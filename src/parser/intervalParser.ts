/**
 * Recursive-descent parser for the interval DSL.
 *
 * Grammar (informal):
 *   sequence  = chain  ("loop" | "∞")?
 *   chain     = unary  ("->" unary)*
 *   unary     = atom ("*" NUMBER)?
 *   atom      = NUMBER | NUMBER ":" NUMBER | "(" chain ")"
 *
 * Examples:
 *   "10 -> 25"
 *   "(10 -> 25) * 4 -> 20"
 *   "(10 -> 25) * 4 -> 20 loop"
 *   "(1:30 -> 5) * 3 loop"
 */

import {
  type IntervalNode,
  type IntervalSequence,
  makeStep,
  makeStepFromMMSS,
  makeGroup,
  makeSequence,
} from '../models/interval';

// ── Tokenizer ────────────────────────────────────────────────────────

type TokenType =
  | 'NUMBER'
  | 'MMSS'
  | 'ARROW'
  | 'STAR'
  | 'LPAREN'
  | 'RPAREN'
  | 'LOOP'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = input.trim();

  while (i < src.length) {
    // Skip whitespace
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }

    // Arrow ->
    if (src[i] === '-' && src[i + 1] === '>') {
      tokens.push({ type: 'ARROW', value: '->' });
      i += 2;
      continue;
    }

    // Arrow → (unicode)
    if (src[i] === '→') {
      tokens.push({ type: 'ARROW', value: '->' });
      i++;
      continue;
    }

    // Star *
    if (src[i] === '*') {
      tokens.push({ type: 'STAR', value: '*' });
      i++;
      continue;
    }

    // Parens
    if (src[i] === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (src[i] === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }

    // Number or MM:SS
    if (/[0-9]/.test(src[i])) {
      let num = '';
      while (i < src.length && /[0-9.]/.test(src[i])) {
        num += src[i];
        i++;
      }
      // Check for MM:SS
      if (i < src.length && src[i] === ':') {
        num += ':';
        i++;
        while (i < src.length && /[0-9]/.test(src[i])) {
          num += src[i];
          i++;
        }
        tokens.push({ type: 'MMSS', value: num });
      } else {
        tokens.push({ type: 'NUMBER', value: num });
      }
      continue;
    }

    // "loop" keyword or ∞
    if (src[i] === '∞') {
      tokens.push({ type: 'LOOP', value: 'loop' });
      i++;
      continue;
    }
    if (src.slice(i, i + 4).toLowerCase() === 'loop') {
      tokens.push({ type: 'LOOP', value: 'loop' });
      i += 4;
      continue;
    }

    throw new Error(`Unexpected character '${src[i]}' at position ${i}`);
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// ── Parser ───────────────────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private eat(type: TokenType): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new Error(
        `Expected ${type} but got ${t.type} ("${t.value}") at token ${this.pos}`,
      );
    }
    this.pos++;
    return t;
  }

  /** sequence = chain ("loop")? */
  parseSequence(): IntervalSequence {
    const chain = this.parseChain();
    let loop = false;
    if (this.peek().type === 'LOOP') {
      this.eat('LOOP');
      loop = true;
    }
    this.eat('EOF');

    // Wrap in a root group
    const root = makeGroup(chain, 1);
    return makeSequence(root, loop);
  }

  /** chain = unary ("->" unary)* */
  private parseChain(): IntervalNode[] {
    const nodes: IntervalNode[] = [this.parseUnary()];
    while (this.peek().type === 'ARROW') {
      this.eat('ARROW');
      nodes.push(this.parseUnary());
    }
    return nodes;
  }

  /** unary = atom ("*" NUMBER)? */
  private parseUnary(): IntervalNode {
    const node = this.parseAtom();
    if (this.peek().type === 'STAR') {
      this.eat('STAR');
      const countToken = this.eat('NUMBER');
      const count = parseInt(countToken.value, 10);
      if (count < 1) throw new Error('Repeat count must be >= 1');
      if (node.type === 'group') {
        node.repeat = count;
        return node;
      }
      // Wrap a single step in a group to repeat it
      return makeGroup([node], count);
    }
    return node;
  }

  /** atom = NUMBER | MMSS | "(" chain ")" */
  private parseAtom(): IntervalNode {
    const t = this.peek();

    if (t.type === 'NUMBER') {
      this.eat('NUMBER');
      return makeStep(parseFloat(t.value));
    }

    if (t.type === 'MMSS') {
      this.eat('MMSS');
      return makeStepFromMMSS(t.value);
    }

    if (t.type === 'LPAREN') {
      this.eat('LPAREN');
      const children = this.parseChain();
      this.eat('RPAREN');
      return makeGroup(children, 1);
    }

    throw new Error(
      `Unexpected token ${t.type} ("${t.value}") at position ${this.pos}`,
    );
  }
}

// ── Public API ───────────────────────────────────────────────────────

export function parseIntervalDSL(input: string): IntervalSequence {
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  return parser.parseSequence();
}
