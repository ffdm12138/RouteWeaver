import Foundation
import JavaScriptCore

let file = CommandLine.arguments[1]
let profileName = CommandLine.arguments[2]
let text = String(decoding: FileHandle.standardInput.readDataToEndOfFile(), as: UTF8.self)
let source = try String(contentsOfFile: file, encoding: .utf8)
let context = JSContext()!
var exception: String?
context.exceptionHandler = { _, value in exception = value?.toString() ?? "JavaScript exception" }
context.evaluateScript(source)
if let exception { fatalError(exception) }
let transform = context.evaluateScript("""
    ((input, name) => {
        const profile = JSON.parse(input);
        if (profile && !Array.isArray(profile) && typeof profile === "object"
            && !("proxy-providers" in profile)) {
            profile["proxy-providers"] = {};
        }
        const rewritten = main(profile, name);
        return rewritten && typeof rewritten === "object" && !Array.isArray(rewritten)
            ? JSON.stringify(rewritten) : null;
    })
    """)
let result = transform?.call(withArguments: [text, profileName])
if let exception { fatalError(exception) }
guard let result, result.isString, let json = result.toString() else { fatalError("Expected configuration object") }
print(json)
