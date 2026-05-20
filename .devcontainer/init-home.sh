#!/bin/bash
# Initialize the persisted home directory with essential dotfiles.

set -e

echo "=== Initializing Home Directory ==="

mkdir -p ~/.local/bin ~/.config ~/.cache ~/go

touch ~/.bash_history

if [ ! -f ~/.bashrc ]; then
    echo "Creating .bashrc..."
    cat > ~/.bashrc << 'EOF'
# ~/.bashrc: executed by bash(1) for non-login shells.

case $- in
    *i*) ;;
      *) return;;
esac

HISTFILE="$HOME/.bash_history"
HISTCONTROL=ignoreboth
HISTSIZE=1000
HISTFILESIZE=2000
shopt -s histappend
shopt -s checkwinsize

PS1='\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '

if [ -x /usr/bin/dircolors ]; then
    test -r ~/.dircolors && eval "$(dircolors -b ~/.dircolors)" || eval "$(dircolors -b)"
    alias ls='ls --color=auto'
    alias grep='grep --color=auto'
fi

alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'

export GOPATH="$HOME/go"
export PATH="$HOME/.local/bin:$GOPATH/bin:$PATH"
EOF
fi

if [ ! -f ~/.profile ]; then
    echo "Creating .profile..."
    cat > ~/.profile << 'EOF'
# ~/.profile: executed by the command interpreter for login shells.

if [ -n "$BASH_VERSION" ] && [ -f "$HOME/.bashrc" ]; then
    . "$HOME/.bashrc"
fi
EOF
fi

git config --global --add safe.directory '*' 2>/dev/null || true

echo "Checking installed tools..."
echo "  go: $(go version 2>/dev/null || echo 'not found')"
echo "  gopls: $(gopls version 2>/dev/null | head -1 || echo 'not found')"
echo "  goimports: $(goimports --help >/dev/null 2>&1 && echo 'installed' || echo 'not found')"
echo "  uv: $(uv --version 2>/dev/null || echo 'not found')"
echo "  python: $(python3 --version 2>/dev/null || echo 'not found')"
echo "  jq: $(jq --version 2>/dev/null || echo 'not found')"
echo "  rg: $(rg --version 2>/dev/null | head -1 || echo 'not found')"

echo ""
echo "=== Home Directory Ready ==="
