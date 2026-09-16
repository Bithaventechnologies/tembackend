declare module "mjml" {
  interface MjmlError {
    line: number;
    message: string;
    tagName?: string;
    formattedMessage: string;
  }

  interface MjmlParseResults {
    html: string;
    errors: MjmlError[];
  }

  interface MjmlParseOptions {
    validationLevel?: "strict" | "soft" | "skip";
    minify?: boolean;
  }

  function mjml2html(input: string, options?: MjmlParseOptions): MjmlParseResults;
  export = mjml2html;
}
