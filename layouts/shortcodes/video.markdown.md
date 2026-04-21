{{- $src := .Get "src" -}}
{{- $caption := .Get "caption" -}}
{{- with $src -}}[Video{{ with $caption }}: {{ . }}{{ end }}]({{ . }}){{- end -}}
