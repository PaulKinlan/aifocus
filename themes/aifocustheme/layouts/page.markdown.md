{{- $authorKeys := .Page.Params.authors | default (slice .Site.Params.defaultAuthor) -}}
{{- $authors := slice -}}
{{- range $authorKeys -}}
  {{- with index site.Params.authors . -}}
    {{- $authors = $authors | append .name -}}
  {{- end -}}
{{- end -}}
# {{ .Title }}

{{ with .Description }}> {{ . }}

{{ end -}}
{{- with $authors }}_By {{ delimit . ", " " and " }} — {{ $.Date.Format "2 January 2006" }}_
{{ end }}
{{ .RenderShortcodes }}

---

{{ with .GetTerms "tags" -}}
Tags: {{ range $i, $t := . }}{{ if $i }}, {{ end }}`{{ .LinkTitle }}`{{ end }}

{{ end -}}
{{- with .OutputFormats.Get "html" -}}
Canonical: {{ .Permalink }}
{{- end }}
