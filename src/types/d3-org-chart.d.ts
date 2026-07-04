// La librería d3-org-chart no publica sus tipos. Declaración mínima con los
// métodos encadenables que usamos.
declare module 'd3-org-chart' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class OrgChart<T = any> {
    container(el: string | HTMLElement): this;
    data(data: T[]): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeWidth(fn: (d: any) => number): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeHeight(fn: (d: any) => number): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    childrenMargin(fn: (d: any) => number): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    siblingsMargin(fn: (d: any) => number): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    neighbourMargin(fn: (a: any, b: any) => number): this;
    compact(v: boolean): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeContent(fn: (d: any) => string): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buttonContent(fn: (params: any) => string): this;
    render(): this;
    fit(): this;
    expandAll(): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }
}
