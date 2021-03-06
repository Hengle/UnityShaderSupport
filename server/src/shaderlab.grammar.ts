import { LanguageGrammar, GrammarPattern, includePattern, namedPattern } from "./grammar";
import { CompletionItemKind } from "vscode-languageserver";
import { cgBuildInTypesCompletion, cgBuildInKeywordsCompletion, CgContext, CgGlobalContext, CgVariable, toCgVariableCompletions, toCgFunctionCompletions, toCompletions } from "./grammar-cg";
import { onFunctionMatch, onParamsDeclare, onBlockMatch, onStructDeclare, onStructMemberDeclare, onExpressionComplete, onPropertiesCompletion, onPropertiesDeclare, onShaderDeclare, onSubShaderDeclare, onTagsMatch, onTagCompletion, onPassDeclare, onRenderSetupCompletion, cgGlobalCompletion, cgPreprocessorCompletion, onVariableDeclare } from "./completion-shaderlab";
import { getKeys, renderSetups, Pass, SubShader } from "./structure-shaderlb";
const grammarShaderLab: LanguageGrammar = {
    stringDelimiter: ["\""],
    pairMatch: [
        ["/*", "*/"],
        ["\"", "\""],
        ["'", "'"],
        ["(", ")"],
        ["{", "}"],
        ["[", "]"],
    ],
    ignore: {
        patterns: [
            "/\* * \*/",
            "//*"
        ]
    },
    patterns: [
        {
            name: "Shader",
            id:"shader-declare",
            patterns: [
                "Shader <string> {shaderScope}",
            ],
            caseInsensitive: true,
            crossLine: true,
            scopes: {
                "shaderScope": {
                    name: "Shader Scope",
                    begin: "{",
                    end: "}",
                    patterns: [
                        { patterns: ["<propertiesPattern>"] },
                        { patterns: ["<subShaderPattern>"] }
                    ],
                    onCompletion: (match) =>
                    {
                        if (match.patternName != "propertiesPattern" && match.patternName != "subShaderPattern")
                        {
                            return toCompletions(["Properties", "SubShader"], CompletionItemKind.Keyword)
                                .concat(toCompletions(["Fallback"], CompletionItemKind.Property));
                        }
                    },
                    onMatched: onShaderDeclare
                }
            },

        }
    ],
    onCompletion: () => toCompletions(["Shader"], CompletionItemKind.Keyword),
    patternRepository: {
        "propertiesPattern":
        {
            name: "Properties",
            patterns: ["Properties {propScope}"],
            caseInsensitive: true,
            crossLine: true,
            scopes: {
                "propScope": {
                    begin: "{",
                    end: "}",
                    patterns: [
                        {
                            name: "Property Declare",
                            patterns: ["<identifier> (<displayName>, <propType>) = <propertyValue>"],
                            dictionary: {
                                "displayName": GrammarPattern.String
                            },
                            onCompletion: onPropertiesCompletion,
                            onMatched:onPropertiesDeclare
                        }
                    ]
                }
            }
        },
        "propertyValue": {
            name: "Property Value",
            patterns: [
                "<number>",
                "<string> \\{[<any>]\\}",
                "(<number>, <number>, <number>, <number>)"
            ]
        },
        "propType": {
            name: "Property Type",
            patterns: ["<typeName>[(<number>[, <number> ...])]"],
            dictionary: {
                "typeName": {
                    patterns: [
                        "/[_a-zA-Z0-9]+/"
                    ]
                }
            }
        },
        "subShaderPattern": {
            name: "SubShader",
            patterns: ["SubShader {subShaderScope}"],
            caseInsensitive: true,
            crossLine: true,
            scopes: {
                "subShaderScope": {
                    begin: "{",
                    end: "}",
                    patterns: [
                        includePattern("tagsPattern"),
                        includePattern("renderSetupPattern"),
                        includePattern("pass"),
                        includePattern("cgProgram")
                    ],
                    onMatched:onSubShaderDeclare
                }
            }
        },
        "pass": {
            name: "Pass",
            patterns: ["Pass {pass}"],
            caseInsensitive: true,
            crossLine: true,
            scopes: {
                "pass": {
                    begin: "{",
                    end: "}",
                    patterns: [
                        includePattern("tagsPattern"),
                        includePattern("renderSetupPattern"),
                        includePattern("cgProgram")
                    ],
                    onMatched: onPassDeclare,
                }
            }
        },
        "tagsPattern": {
            name: "Tags",
            patterns: ["Tags {tagScope}"],
            crossLine: true,
            caseInsensitive: true,
            scopes: {
                "tagScope": {
                    begin: "{",
                    end: "}",
                    skipMode: "space",
                    patterns: [
                        {
                            id:"tag",
                            patterns: ["<tag> = <value>"],
                            dictionary: {
                                "tag": {patterns:["<string>","<identifier>"]},
                                "value": {patterns:["<string>","<identifier>"]}
                            },
                            onCompletion:  onTagCompletion
                        }
                    ],
                    onCompletion: onTagCompletion
                }
            },
        },
        "renderSetupPattern": {
            name: "Render Setup",
            patterns: ["<stateName> < > <value> [[,] < > <value>...]"],
            dictionary: {
                "stateName": GrammarPattern.Identifier,
                "value": {
                    name: "Render Setup Value",
                    patterns: ["<identifier>", "<string>", "<number>", "{value-scope}"],
                    scopes: {
                        "value-scope": {
                            begin: "{",
                            end: "}",
                            patterns:[]
                        }
                    }
                }
            },
            onCompletion:onRenderSetupCompletion
        },
        "cgProgram": {
            name: "Cg Program",
            patterns: ["{cgProgram}"],
            scopes: {
                "cgProgram": {
                    begin: "CGPROGRAM",
                    end: "ENDCG",
                    patterns: [
                        {
                            id:"preprocessor",
                            name: "Preprocessor",
                            patterns: [
                                "#pragma <cmd> <name> [<options> ...]",
                                "#pragma <cmd> [<feature> ...]",
                                "#pragma <cmd>"
                            ],
                            keepSpace: true,
                            dictionary: {
                                "name": {
                                    patterns: ["<number>", "<identifier>"]
                                }
                            },
                            onCompletion:cgPreprocessorCompletion
                        },
                        includePattern("variableDeclare"),
                        includePattern("functionDefinition"),
                        includePattern("structDeclare")
                    ],
                    onMatched: (match) =>
                    {
                        match.state = new CgGlobalContext();
                        if (match.matchedScope.state instanceof Pass)
                        {
                            match.matchedScope.state.setCgCode(match.state);
                        }
                        else if (match.matchedScope.state instanceof SubShader)
                        {
                            match.matchedScope.state.setCgCode(match.state);
                        }
                    },
                    onCompletion:cgGlobalCompletion
                }
            }
        },
        "functionDefinition": {
            name: "Function Definition",
            patterns: ["<type> <name>([<paramsDeclare>][,<paramsDeclare>...])[:<semantics>]{body-block}"],
            dictionary: {
                "type": GrammarPattern.Identifier,
                "name": GrammarPattern.Identifier,
                "semantics": GrammarPattern.Identifier
            },
            onMatched: onFunctionMatch,
            onCompletion: (match) =>
            {
                if (match.patternName === "type")
                {
                    return cgBuildInTypesCompletion;
                }
                return [];
            }
        },
        "paramsDeclare": {
            name: "Params Declare",
            patterns: ["[<decorator>] <type> < > <name> [:<semantics>]"],
            dictionary: {
                "type": GrammarPattern.Identifier,
                "name": GrammarPattern.Identifier,
                "semantics": GrammarPattern.Identifier,
                "decorator": {
                    patterns: ["in ", "out ", "inout "],
                    keepSpace: true
                }
            },
            onMatched: onParamsDeclare
        },
        "structDeclare": {
            name: "Struct",
            patterns: ["struct <name>{struct-body};"],
            scopes: {
                "struct-body": {
                    begin: "{",
                    end: "}",
                    patterns: [{
                        name: "Member Declare",
                        id:"member-declare",
                        patterns: ["<type> < > <name> [:<semantics>];"],
                        onMatched: onStructMemberDeclare
                    }]
                }
            },
            onMatched:onStructDeclare
        },
        "variableDeclare": {
            name: "Variable Declare",
            patterns: ["<type> < > <name> [:<semantics>] [= <expression>] [, <name> [:<semantics>] [= <expression>] ...];"],
            dictionary: {
                "type": GrammarPattern.Identifier,
                "name": GrammarPattern.Identifier,
                "semantics": GrammarPattern.Identifier
            },
            onMatched: (match) =>
            {
                let type = match.getMatch("type")[0].text;
                let name = match.getMatch("name")[0].text;
                let semantics = match.getMatch("semantics")[0] ? match.getMatch("semantics")[0].text : "";
                let context = match.matchedScope.state as CgContext;
                context.addVariable(new CgVariable(context.getType(type), name, semantics));
            },
            onCompletion: onVariableDeclare
        },
        "expression": {
            name: "Expression",
            patterns: [
                "<expr-unit> [<operator> <expr-unit> ...]"
            ],
            strict: true,
            dictionary: {
                "expr-unit": {
                    name: "Expression Unit with Operator",
                    patterns: ["[<unary-operator> ...]<unit>[<postfix>]"],
                    dictionary: {
                        "unit": {
                            name: "Expression Unit",
                            patterns: [
                                "<func-call>",
                                "<identifier>",
                                "<number>",
                                "<bracket>",
                            ]
                        },
                        "unary-operator": {
                            name: "Unary Operator",
                            patterns: ["!", "+", "-", "~","++","--","*","&","(<type>)","sizeof< >"]
                        },
                        "postfix": {
                            name: "Postfix Operator",
                            patterns: ["++", "--","\\[<expression>\\]"]
                        }
                    }
                },
                "operator": {
                    name: "Operator",
                    patterns: ["/(((\\+|-|\\*|\\/|%|=|&|\\||\\^|<<|>>)=?)|(<|>|<=|>=|==|\\!=|\\|\\||&&)|(\\.|\\?|\\:|~|,))/"]
                }
            },
            onCompletion: onExpressionComplete
        },
        "bracket": {
            name: "Bracket",
            patterns: ["(<expression>)"]
        },
        "func-call": {
            name: "Function Call",
            patterns: ["<identifier> (<expression> [, <expression> ...])"]
        }
    },
    scopeRepository: {
        "body-block": {
            name: "Block",
            begin: "{",
            end: "}",
            patterns: [
                includePattern("variableDeclare"),
                {
                    name: "Statement",
                    id:"statement",
                    patterns: ["<expression>;"]
                },
                {
                    name: "If",
                    id:"if-structure",
                    patterns: ["if (<expression>) {body-block} "]
                },
                {
                    name: "For Loop",
                    id:"for-structure",
                    patterns: ["for (<expression>;<expression>;<expression>) {body-block}"]
                },
                {
                    name: "While Loop",
                    id:"while-structure",
                    patterns: ["while (<expression>) {body-block}"]
                },
                {
                    name: "Do-While Loop",
                    id:"do-while-structure",
                    patterns: ["do {body-block} while (<expression>);"],
                    crossLine: true
                },
                {
                    name: "No sense code",
                    patterns: ["<no-sense>"],
                    dictionary: {
                        "no-sense": {
                            patterns:["/[_a-zA-Z0-9]+\\r\\n/"]
                        }
                    }
                }
            ],
            onMatched: onBlockMatch,
            onCompletion: (match) =>
            {
                let context = match.matchedScope.state as CgContext;
                if (match.patternName === "no-sense")
                    return cgBuildInKeywordsCompletion
                        .concat(cgBuildInTypesCompletion)
                        .concat(toCgVariableCompletions(context.getAllVariables()))
                        .concat(toCgFunctionCompletions(context.global.functions));
                return [];
            }
        }
    }
};

export default grammarShaderLab;