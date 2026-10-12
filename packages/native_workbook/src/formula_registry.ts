/**
 * Central Formula Registry and Function Catalog (M06-T02).
 * Maintains supported calculation functions, category taxonomy, argument bounds,
 * and deterministic volatility semantics shared across server, native, and web.
 */

export type FunctionCategory =
  | 'math'
  | 'logical'
  | 'text'
  | 'datetime'
  | 'lookup'
  | 'engineering'
  | 'financial'
  | 'custom';

export interface FunctionDefinition {
  name: string;
  category: FunctionCategory;
  minArgs: number;
  maxArgs: number; // Use Infinity for variadic
  isVolatile: boolean;
  description: string;
  signature: string;
}

export class FormulaRegistry {
  private functions = new Map<string, FunctionDefinition>();

  constructor() {
    this.registerStandardFunctions();
  }

  public register(def: FunctionDefinition): void {
    const key = def.name.toUpperCase();
    this.functions.set(key, { ...def, name: key });
  }

  public lookup(name: string): FunctionDefinition | undefined {
    return this.functions.get(name.toUpperCase());
  }

  public has(name: string): boolean {
    return this.functions.has(name.toUpperCase());
  }

  public isVolatile(name: string): boolean {
    const fn = this.lookup(name);
    return fn ? fn.isVolatile : false;
  }

  public validateCall(
    name: string,
    argCount: number
  ): { valid: boolean; error?: string } {
    const fn = this.lookup(name);
    if (!fn) {
      return { valid: false, error: `#NAME? Unknown function "${name}"` };
    }
    if (argCount < fn.minArgs) {
      return {
        valid: false,
        error: `Function ${fn.name} expects at least ${fn.minArgs} argument(s), got ${argCount}`,
      };
    }
    if (argCount > fn.maxArgs) {
      return {
        valid: false,
        error: `Function ${fn.name} expects at most ${fn.maxArgs} argument(s), got ${argCount}`,
      };
    }
    return { valid: true };
  }

  public list(category?: FunctionCategory): FunctionDefinition[] {
    const all = Array.from(this.functions.values());
    if (category) {
      return all.filter((f) => f.category === category);
    }
    return all;
  }

  private registerStandardFunctions(): void {
    // 1. Math / Statistics
    const mathFns: FunctionDefinition[] = [
      {
        name: 'SUM',
        category: 'math',
        minArgs: 1,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Calculates the sum of supplied numbers or ranges',
        signature: 'SUM(number1, [number2], ...)',
      },
      {
        name: 'PRODUCT',
        category: 'math',
        minArgs: 1,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Multiplies all supplied numbers',
        signature: 'PRODUCT(number1, [number2], ...)',
      },
      {
        name: 'ROUND',
        category: 'math',
        minArgs: 2,
        maxArgs: 2,
        isVolatile: false,
        description: 'Rounds a number to a specified number of digits',
        signature: 'ROUND(number, num_digits)',
      },
      {
        name: 'ROUNDUP',
        category: 'math',
        minArgs: 2,
        maxArgs: 2,
        isVolatile: false,
        description: 'Rounds a number up away from 0',
        signature: 'ROUNDUP(number, num_digits)',
      },
      {
        name: 'ROUNDDOWN',
        category: 'math',
        minArgs: 2,
        maxArgs: 2,
        isVolatile: false,
        description: 'Rounds a number down toward 0',
        signature: 'ROUNDDOWN(number, num_digits)',
      },
      {
        name: 'ABS',
        category: 'math',
        minArgs: 1,
        maxArgs: 1,
        isVolatile: false,
        description: 'Returns the absolute value of a number',
        signature: 'ABS(number)',
      },
      {
        name: 'INT',
        category: 'math',
        minArgs: 1,
        maxArgs: 1,
        isVolatile: false,
        description: 'Rounds a number down to the nearest integer',
        signature: 'INT(number)',
      },
      {
        name: 'MOD',
        category: 'math',
        minArgs: 2,
        maxArgs: 2,
        isVolatile: false,
        description: 'Returns remainder after division',
        signature: 'MOD(number, divisor)',
      },
      {
        name: 'SQRT',
        category: 'math',
        minArgs: 1,
        maxArgs: 1,
        isVolatile: false,
        description: 'Returns square root of a number',
        signature: 'SQRT(number)',
      },
      {
        name: 'POWER',
        category: 'math',
        minArgs: 2,
        maxArgs: 2,
        isVolatile: false,
        description: 'Returns the result of a number raised to a power',
        signature: 'POWER(number, power)',
      },
      {
        name: 'MAX',
        category: 'math',
        minArgs: 1,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Returns largest value in set',
        signature: 'MAX(number1, [number2], ...)',
      },
      {
        name: 'MIN',
        category: 'math',
        minArgs: 1,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Returns smallest value in set',
        signature: 'MIN(number1, [number2], ...)',
      },
      {
        name: 'AVERAGE',
        category: 'math',
        minArgs: 1,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Returns the arithmetic mean',
        signature: 'AVERAGE(number1, [number2], ...)',
      },
      {
        name: 'COUNT',
        category: 'math',
        minArgs: 1,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Counts the number of cells containing numbers',
        signature: 'COUNT(val1, [val2], ...)',
      },
      {
        name: 'COUNTA',
        category: 'math',
        minArgs: 1,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Counts non-empty cells',
        signature: 'COUNTA(val1, [val2], ...)',
      },
      {
        name: 'SUBTOTAL',
        category: 'math',
        minArgs: 2,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Calculates subtotal of a list or database',
        signature: 'SUBTOTAL(function_num, ref1, [ref2], ...)',
      },
      {
        name: 'SUMPRODUCT',
        category: 'math',
        minArgs: 1,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Multiplies corresponding components in arrays and returns sum',
        signature: 'SUMPRODUCT(array1, [array2], ...)',
      },
    ];

    // 2. Logical
    const logicalFns: FunctionDefinition[] = [
      {
        name: 'IF',
        category: 'logical',
        minArgs: 2,
        maxArgs: 3,
        isVolatile: false,
        description: 'Conditional evaluation',
        signature: 'IF(logical_test, value_if_true, [value_if_false])',
      },
      {
        name: 'IFS',
        category: 'logical',
        minArgs: 2,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Evaluates multiple condition/result pairs',
        signature: 'IFS(condition1, value1, [condition2, value2], ...)',
      },
      {
        name: 'AND',
        category: 'logical',
        minArgs: 1,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Returns TRUE if all arguments evaluate to TRUE',
        signature: 'AND(logical1, [logical2], ...)',
      },
      {
        name: 'OR',
        category: 'logical',
        minArgs: 1,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Returns TRUE if any argument evaluates to TRUE',
        signature: 'OR(logical1, [logical2], ...)',
      },
      {
        name: 'NOT',
        category: 'logical',
        minArgs: 1,
        maxArgs: 1,
        isVolatile: false,
        description: 'Inverts logical argument',
        signature: 'NOT(logical)',
      },
      {
        name: 'IFERROR',
        category: 'logical',
        minArgs: 2,
        maxArgs: 2,
        isVolatile: false,
        description: 'Returns alternate value if expression is an error',
        signature: 'IFERROR(value, value_if_error)',
      },
      {
        name: 'SWITCH',
        category: 'logical',
        minArgs: 3,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Evaluates an expression against a list of values',
        signature: 'SWITCH(expression, value1, result1, [default_or_value2], ...)',
      },
    ];

    // 3. Text
    const textFns: FunctionDefinition[] = [
      {
        name: 'CONCAT',
        category: 'text',
        minArgs: 1,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Concatenates list or range of text strings',
        signature: 'CONCAT(text1, [text2], ...)',
      },
      {
        name: 'CONCATENATE',
        category: 'text',
        minArgs: 1,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Joins several text items into one',
        signature: 'CONCATENATE(text1, [text2], ...)',
      },
      {
        name: 'TEXT',
        category: 'text',
        minArgs: 2,
        maxArgs: 2,
        isVolatile: false,
        description: 'Formats a number into text according to format string',
        signature: 'TEXT(value, format_text)',
      },
      {
        name: 'LEFT',
        category: 'text',
        minArgs: 1,
        maxArgs: 2,
        isVolatile: false,
        description: 'Returns leftmost characters of string',
        signature: 'LEFT(text, [num_chars])',
      },
      {
        name: 'RIGHT',
        category: 'text',
        minArgs: 1,
        maxArgs: 2,
        isVolatile: false,
        description: 'Returns rightmost characters of string',
        signature: 'RIGHT(text, [num_chars])',
      },
      {
        name: 'MID',
        category: 'text',
        minArgs: 3,
        maxArgs: 3,
        isVolatile: false,
        description: 'Returns characters from middle of string',
        signature: 'MID(text, start_num, num_chars)',
      },
      {
        name: 'LEN',
        category: 'text',
        minArgs: 1,
        maxArgs: 1,
        isVolatile: false,
        description: 'Returns character length of string',
        signature: 'LEN(text)',
      },
      {
        name: 'TRIM',
        category: 'text',
        minArgs: 1,
        maxArgs: 1,
        isVolatile: false,
        description: 'Removes leading and trailing spaces from text',
        signature: 'TRIM(text)',
      },
      {
        name: 'UPPER',
        category: 'text',
        minArgs: 1,
        maxArgs: 1,
        isVolatile: false,
        description: 'Converts text to uppercase',
        signature: 'UPPER(text)',
      },
      {
        name: 'LOWER',
        category: 'text',
        minArgs: 1,
        maxArgs: 1,
        isVolatile: false,
        description: 'Converts text to lowercase',
        signature: 'LOWER(text)',
      },
    ];

    // 4. DateTime (includes volatile NOW, TODAY, RAND)
    const dateFns: FunctionDefinition[] = [
      {
        name: 'NOW',
        category: 'datetime',
        minArgs: 0,
        maxArgs: 0,
        isVolatile: true,
        description: 'Returns current date and time (volatile)',
        signature: 'NOW()',
      },
      {
        name: 'TODAY',
        category: 'datetime',
        minArgs: 0,
        maxArgs: 0,
        isVolatile: true,
        description: 'Returns current calendar date (volatile)',
        signature: 'TODAY()',
      },
      {
        name: 'RAND',
        category: 'math',
        minArgs: 0,
        maxArgs: 0,
        isVolatile: true,
        description: 'Returns pseudo-random real between 0 and 1 (volatile)',
        signature: 'RAND()',
      },
      {
        name: 'DATE',
        category: 'datetime',
        minArgs: 3,
        maxArgs: 3,
        isVolatile: false,
        description: 'Creates a date given year, month, and day',
        signature: 'DATE(year, month, day)',
      },
      {
        name: 'YEAR',
        category: 'datetime',
        minArgs: 1,
        maxArgs: 1,
        isVolatile: false,
        description: 'Returns the year of a date',
        signature: 'YEAR(serial_number)',
      },
      {
        name: 'MONTH',
        category: 'datetime',
        minArgs: 1,
        maxArgs: 1,
        isVolatile: false,
        description: 'Returns the month of a date',
        signature: 'MONTH(serial_number)',
      },
      {
        name: 'DAY',
        category: 'datetime',
        minArgs: 1,
        maxArgs: 1,
        isVolatile: false,
        description: 'Returns the day of a date',
        signature: 'DAY(serial_number)',
      },
      {
        name: 'EDATE',
        category: 'datetime',
        minArgs: 2,
        maxArgs: 2,
        isVolatile: false,
        description: 'Returns date offset by specified number of months',
        signature: 'EDATE(start_date, months)',
      },
    ];

    // 5. Lookup / Reference
    const lookupFns: FunctionDefinition[] = [
      {
        name: 'VLOOKUP',
        category: 'lookup',
        minArgs: 3,
        maxArgs: 4,
        isVolatile: false,
        description: 'Looks for a value in first column of table array',
        signature: 'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])',
      },
      {
        name: 'HLOOKUP',
        category: 'lookup',
        minArgs: 3,
        maxArgs: 4,
        isVolatile: false,
        description: 'Looks for a value in top row of table array',
        signature: 'HLOOKUP(lookup_value, table_array, row_index_num, [range_lookup])',
      },
      {
        name: 'INDEX',
        category: 'lookup',
        minArgs: 2,
        maxArgs: 3,
        isVolatile: false,
        description: 'Returns a value or reference of the cell at given intersection',
        signature: 'INDEX(array, row_num, [column_num])',
      },
      {
        name: 'MATCH',
        category: 'lookup',
        minArgs: 2,
        maxArgs: 3,
        isVolatile: false,
        description: 'Returns relative position of an item in an array',
        signature: 'MATCH(lookup_value, lookup_array, [match_type])',
      },
      {
        name: 'CHOOSE',
        category: 'lookup',
        minArgs: 2,
        maxArgs: Infinity,
        isVolatile: false,
        description: 'Chooses a value from a list based on index number',
        signature: 'CHOOSE(index_num, value1, [value2], ...)',
      },
    ];

    for (const fn of [...mathFns, ...logicalFns, ...textFns, ...dateFns, ...lookupFns]) {
      this.register(fn);
    }
  }
}

export const defaultFormulaRegistry = new FormulaRegistry();
