// A small JSON reader and writer: the add-on ships as one DLL, so it carries no JSON library (a second copy of one
// beside LiveSplit's own can clash). Reads objects, arrays, strings, numbers, booleans and null into plain .NET values
// (Dictionary<string, object>, List<object>, string, double, bool, null); writes the same.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace GameShuffle.Link
{
    public static class Json
    {
        public static object Parse(string text)
        {
            var p = new Parser(text);
            p.SkipSpace();
            var value = p.Value();
            p.SkipSpace();
            if (!p.AtEnd) throw new FormatException("Unexpected text after the JSON value.");
            return value;
        }

        /// <summary>Parses an object, or returns null when the text isn't a JSON object.</summary>
        public static Dictionary<string, object> TryParseObject(string text)
        {
            try { return Parse(text) as Dictionary<string, object>; }
            catch (FormatException) { return null; }
        }

        public static string Write(object value)
        {
            var sb = new StringBuilder();
            WriteValue(sb, value);
            return sb.ToString();
        }

        static void WriteValue(StringBuilder sb, object value)
        {
            switch (value)
            {
                case null: sb.Append("null"); break;
                case string s: WriteString(sb, s); break;
                case bool b: sb.Append(b ? "true" : "false"); break;
                case int i: sb.Append(i.ToString(CultureInfo.InvariantCulture)); break;
                case long l: sb.Append(l.ToString(CultureInfo.InvariantCulture)); break;
                case double d: sb.Append(d.ToString("R", CultureInfo.InvariantCulture)); break;
                case IDictionary<string, object> obj:
                    sb.Append('{');
                    var first = true;
                    foreach (var kv in obj)
                    {
                        if (!first) sb.Append(',');
                        first = false;
                        WriteString(sb, kv.Key);
                        sb.Append(':');
                        WriteValue(sb, kv.Value);
                    }
                    sb.Append('}');
                    break;
                case System.Collections.IEnumerable list:
                    sb.Append('[');
                    var firstItem = true;
                    foreach (var item in list)
                    {
                        if (!firstItem) sb.Append(',');
                        firstItem = false;
                        WriteValue(sb, item);
                    }
                    sb.Append(']');
                    break;
                default: throw new ArgumentException("Can't write a " + value.GetType().Name + " as JSON.");
            }
        }

        static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (var c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        sealed class Parser
        {
            readonly string s;
            int i;
            int depth;
            public Parser(string text) { s = text ?? ""; }
            public bool AtEnd => i >= s.Length;

            public void SkipSpace()
            {
                while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++;
            }

            public object Value()
            {
                if (AtEnd) throw new FormatException("Unexpected end of JSON.");
                var c = s[i];
                if (c == '{') return Obj();
                if (c == '[') return Arr();
                if (c == '"') return Str();
                if (c == 't') return Word("true", true);
                if (c == 'f') return Word("false", false);
                if (c == 'n') return Word("null", null);
                if (c == '-' || (c >= '0' && c <= '9')) return Num();
                throw new FormatException("Unexpected character in JSON.");
            }

            object Word(string word, object value)
            {
                if (string.CompareOrdinal(s, i, word, 0, word.Length) != 0) throw new FormatException("Bad JSON literal.");
                i += word.Length;
                return value;
            }

            Dictionary<string, object> Obj()
            {
                if (++depth > 32) throw new FormatException("JSON nests too deep.");
                var obj = new Dictionary<string, object>();
                i++;
                SkipSpace();
                if (!AtEnd && s[i] == '}') { i++; depth--; return obj; }
                while (true)
                {
                    SkipSpace();
                    if (AtEnd || s[i] != '"') throw new FormatException("Expected a key.");
                    var key = Str();
                    SkipSpace();
                    if (AtEnd || s[i] != ':') throw new FormatException("Expected a colon.");
                    i++;
                    SkipSpace();
                    obj[key] = Value();
                    SkipSpace();
                    if (AtEnd) throw new FormatException("Unclosed object.");
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == '}') { i++; depth--; return obj; }
                    throw new FormatException("Expected a comma or a closing brace.");
                }
            }

            List<object> Arr()
            {
                if (++depth > 32) throw new FormatException("JSON nests too deep.");
                var list = new List<object>();
                i++;
                SkipSpace();
                if (!AtEnd && s[i] == ']') { i++; depth--; return list; }
                while (true)
                {
                    SkipSpace();
                    list.Add(Value());
                    SkipSpace();
                    if (AtEnd) throw new FormatException("Unclosed array.");
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == ']') { i++; depth--; return list; }
                    throw new FormatException("Expected a comma or a closing bracket.");
                }
            }

            string Str()
            {
                var sb = new StringBuilder();
                i++;
                while (true)
                {
                    if (AtEnd) throw new FormatException("Unclosed string.");
                    var c = s[i++];
                    if (c == '"') return sb.ToString();
                    if (c != '\\') { sb.Append(c); continue; }
                    if (AtEnd) throw new FormatException("Unclosed string.");
                    var e = s[i++];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (i + 4 > s.Length) throw new FormatException("Bad escape.");
                            sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                            i += 4;
                            break;
                        default: throw new FormatException("Bad escape.");
                    }
                }
            }

            double Num()
            {
                var start = i;
                if (s[i] == '-') i++;
                while (i < s.Length && "0123456789.eE+-".IndexOf(s[i]) >= 0) i++;
                if (!double.TryParse(s.Substring(start, i - start), NumberStyles.Float, CultureInfo.InvariantCulture, out var d))
                    throw new FormatException("Bad number.");
                return d;
            }
        }
    }
}
