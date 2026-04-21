{{- $src := .Get "src" -}}
{{- $alt := .Get "alt" | default (.Get "caption") -}}
{{- $caption := .Get "caption" -}}
{{- $link := .Get "link" -}}
{{- with $src -}}
{{- if $link -}}
[![{{ $alt }}]({{ . }})]({{ $link }})
{{- else -}}
![{{ $alt }}]({{ . }})
{{- end -}}
{{- with $caption }}

_{{ . }}_{{ end -}}
{{- end -}}
