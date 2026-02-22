3.2 System of constraints

Given a circuit $C=(Q,\rho)$, a system of constraints contains two subsystems: arithmetic constraints and copy constraints. Arithmetic constraints checks whether all wire assignments $d_j^{(i)}$ for $h\in\{0,\cdots,s_{\max}-1\}$ and $j\in\{0,\cdots,m_D\}$ satisfy the QAP of $Q$. Copy constraints checks the correctness of the connection between subcircuits in the placement by checking whether the wire assignments to the connecting wires, i.e., $b_j^{(i)}$ for $(i,j)\in\mathcal{N}$ satisfy a permutation $\rho$.

For the construction of a constraint system, we need Lagrange bases $K_i\in\mathbb{F}[Z]$ for $i\in\{0,\cdots,m_I-1\}$ and $L_i\in\mathbb{F}[Y]$ for $i\in\{0,\cdots,s_{\max}-1\}$ such that $K_i(\omega_{m_I}^i)=L_i(\omega_{s_{\max}}^i)=1$ and $K_i(\omega_{m_I}^k)=L_i(\omega_{s_{\max}}^k)=0$ for every $k\neq i$.

We encode some of the wire assignments $\{d_j^{(i)}\}_{i=0}^{s_{\max}-1}$ for each $j\in\{0,\cdots,m_D-1\}$ into polynomials according to the roles of wires as discussed in (7):

$$
\sum_{i=0}^{s_{\max}-1} d_j^{(i)}L_i(Y):=
\begin{cases}
b_{j-l}(Y), & \text{for } j=l,\cdots,l+m_I-1,\\[2pt]
c_{j-(l+m_I)}(Y), & \text{for } j=l+m_I,\cdots,m_D-1.
\end{cases}
\tag{9}
$$

1) Arithmetic constraints

The arithmetic constraints can be represented by a set of equations: for all $(x,y)\in\{\omega_n^i\}_{i=0}^{n-1}\times\{\omega_{s_{\max}}^i\}_{i=0}^{s_{\max}-1}$,

$$
p_0(x,y)=0,
\tag{10}
$$

where

$$
p_0(X,Y):=U(X,Y)V(X,Y)-W(X,Y),
$$

and for $O\in\{U,V,W\}$,

$$
O(X,Y):=\sum_{j=0}^{l_{\text{in}}-1} d_j^{(0)}L_0(Y)o_j(X)
+\sum_{j=l_{\text{in}}}^{l-1} d_j^{(s_D-1)}L_{-1}(Y)o_j(X)
+\sum_{j=l}^{l_D-1} b_{j-l}(Y)o_j(X)
+\sum_{j=l_D}^{m_D-1} c_{j-l_D}(Y)o_j(X),
\tag{11}
$$

where $o_i=u_i$, if $O=U$; $o_i=v_i$, if $O=V$; and $o_i=w_i$, if $O=W$.

Applying Corollary 1 to the $ns_{\max}$ equations of (10), the arithmetic constraints are satisfied if and only if

$$
\exists q_0,q_1\in\mathbb{F}[X,Y]:\ p_0(X,Y)=q_0(X,Y)t_n(X)+q_1(X,Y)t_{s_{\max}}(Y).
\tag{12}
$$

2) Copy constraints

The copy constraints check whether $b(X,Y)$ satisfies a permutation $\rho$, where

$$
b(X,Y):=\sum_{j=0}^{l_D-l-1} b_j(Y)K_j(X).
\tag{13}
$$

For $\rho(i,j)\mapsto(h,k)$, we write $\rho(i,j)_1=h$ and $\rho(i,j)_2=k$. We say the copy constraints are satisfied if and only if $B(\omega_{m_I}^j,\omega_{s_{\max}}^i)=B(\omega_{m_I}^{\rho(i,j)_2},\omega_{s_{\max}}^{\rho(i,j)_1})$, i.e., $b_j^{(i)}=b_{\rho(i,j)_2}^{(\rho(i,j)_1)}$ for every connecting wire index $(i,j)\in\mathcal{N}$.

Motivated by [5, 7, 33], we construct a permutation check algorithm for the copy constraints. We first encode $\rho$ into permutation polynomials $s^{(0)},s^{(1)},s^{(2)}\in\mathbb{F}[X,Y]$ such that for $(i,j)\in\mathcal{N}$,

$$
\begin{aligned}
s^{(0)}(\omega_{m_I}^j,\omega_{s_{\max}}^i)&=\omega_{m_I}^{\rho(i,j)_2},\\
s^{(1)}(\omega_{m_I}^j,\omega_{s_{\max}}^i)&=\omega_{s_{\max}}^{\rho(i,j)_1},\\
s^{(2)}(\omega_{m_I}^j,\omega_{s_{\max}}^i)&=\omega_{m_I}^j \Longleftrightarrow s^{(2)}(X,Y):=X.
\end{aligned}
\tag{14}
$$

With introducing indeterminates $\boldsymbol{\theta}=(\theta_0,\theta_1,\theta_2)$, we also define

$$
\begin{aligned}
f(X,Y,\boldsymbol{\theta})&:=b(X,Y)+\theta_0 s^{(0)}(X,Y)+\theta_1 s^{(1)}(X,Y)+\theta_2,\\
g(X,Y,\boldsymbol{\theta})&:=b(X,Y)+\theta_0 s^{(2)}(X,Y)+\theta_1 Y+\theta_2.
\end{aligned}
\tag{15}
$$

Lemma 3 below is useful for checking the copy constraints.

Lemma 3. Given polynomials $f,g$ defined in (15), $b(X,Y)$ satisfies copy constraints with $\rho$, if and only if the following equation holds

$$
\prod_{x\in\mathcal{X},\,y\in\mathcal{Y}} f(x,y,\boldsymbol{\theta})
=
\prod_{x\in\mathcal{X},\,y\in\mathcal{Y}} g(x,y,\boldsymbol{\theta}),
\tag{16}
$$

where $\mathcal{X}:=\{\omega_{m_I}^i\}_{i=0}^{m_I-1}$ and $\mathcal{Y}:=\{\omega_{s_{\max}}^i\}_{i=0}^{s_{\max}-1}$.

Proof. For the simplicity of expression, we denote $b_{i,j}=b(\omega_{m_I}^j,\omega_{s_{\max}}^i)$ for $(i,j)\in\mathcal{N}$. If $b_{i,j}=b_{\rho(i,j)}$ then the factors on both sides are the same, just in a different order, so the equation holds. Conversely, suppose the equation (16) holds. Consider the roots of $\theta_0$ on both sides given by

$$
\Bigg\{
\frac{b_{i,j}+\omega_{m_I}^{\rho(i,j)_2}\theta_1+\theta_2}{\omega_{s_{\max}}^{\rho(i,j)_1}}:(i,j)\in\mathcal{N}
\Bigg\}
=
\Bigg\{
\frac{b_{h,k}+\omega_{m_I}^k\theta_1+\theta_2}{\omega_{s_{\max}}^h}:(h,k)\in\mathcal{N}
\Bigg\}.
$$

The equation implies that two sets of roots must be the same, i.e., for every $(i,j)\in\mathcal{N}$, there must exist $(h,k)\in\mathcal{N}$ such that

$$
\omega_{s_{\max}}^{h}\big(b_{i,j}+\omega_{m_I}^{\rho(i,j)_2}\theta_1+\theta_2\big)
=
\omega_{s_{\max}}^{\rho(i,j)_1}\big(b_{h,k}+\omega_{m_I}^{k}\theta_1+\theta_2\big).
$$

Since there is the unique pair $((h,i),(j,k))\in\mathcal{N}$ such that $\omega_Y^j=\omega_Y^{\rho(h,i)_1}$ and $\omega_Z^k=\omega_Z^{\rho(h,i)_2}$ by the definition of $\rho$, we conclude that on those indices it holds $b_{h,i}=b_{j,k}$. In other words, $b_{i,j}=b_{\rho(i,j)}$. $\square$

For an efficient utilization of Lemma 3, we define a recursion polynomial $r\in\mathbb{F}[X,Y,\boldsymbol{\theta}]$ such that

$$
\left\{
\begin{aligned}
r(\omega_{m_I}^{m_I-1},\omega_{s_{\max}}^{s_{\max}-1},\boldsymbol{\theta})&=1,\\
r(\omega_{m_I}^j,\omega_{s_{\max}}^i,\boldsymbol{\theta})\,g(\omega_{m_I}^j,\omega_{s_{\max}}^i,\boldsymbol{\theta})
&=
r(\omega_{m_I}^{j-1},\omega_{s_{\max}}^i,\boldsymbol{\theta})\,f(\omega_{m_I}^j,\omega_{s_{\max}}^i,\boldsymbol{\theta}),\\
&\qquad \text{for } 0\le i\le s_{\max}-1,\ 0< j\le m_I-1,\\
r(\omega_{m_I}^0,\omega_{s_{\max}}^i,\boldsymbol{\theta})\,g(\omega_{m_I}^0,\omega_{s_{\max}}^i,\boldsymbol{\theta})
&=
r(\omega_{m_I}^{m_I-1},\omega_{s_{\max}}^{i-1},\boldsymbol{\theta})\,f(\omega_{m_I}^0,\omega_{s_{\max}}^i,\boldsymbol{\theta}),\\
&\qquad \text{for } 0\le i\le s_{\max}-1.
\end{aligned}
\right.
\tag{17}
$$

It is straightforward to see that there exists $r(X,Y,\boldsymbol{\theta})$ that holds (17), if and only if the equation (16) holds.

By Corollary 1, the polynomial $r(X,Y,\boldsymbol{\theta})$ satisfies (17), if and only if there exist $q_i\in\mathbb{F}[X,Y,\boldsymbol{\theta}]$ for $i\in\{2,\cdots,7\}$ such that

$$
\begin{aligned}
p_1(X,Y,\boldsymbol{\theta})&=q_2(X,Y,\boldsymbol{\theta})t_{m_I}(X)+q_3(X,Y,\boldsymbol{\theta})t_{s_{\max}}(Y),\\
p_2(X,Y,\boldsymbol{\theta})&=q_4(X,Y,\boldsymbol{\theta})t_{m_I}(X)+q_5(X,Y,\boldsymbol{\theta})t_{s_{\max}}(Y),\\
p_3(X,Y,\boldsymbol{\theta})&=q_6(X,Y,\boldsymbol{\theta})t_{m_I}(X)+q_7(X,Y,\boldsymbol{\theta})t_{s_{\max}}(Y),
\end{aligned}
\tag{18}
$$

where

$$
\begin{aligned}
p_1(X,Y,\boldsymbol{\theta})&:=(r(X,Y,\boldsymbol{\theta})-1)K_{-1}(X)L_{-1}(Y),\\
p_2(X,Y,\boldsymbol{\theta})&:=(X-1)\big(r(X,Y,\boldsymbol{\theta})g(X,Y,\boldsymbol{\theta})-r(\omega_{m_I}^{-1}X,Y,\boldsymbol{\theta})f(X,Y,\boldsymbol{\theta})\big),\\
p_3(X,Y,\boldsymbol{\theta})&:=K_0(X)\big(r(X,Y,\boldsymbol{\theta})g(X,Y,\boldsymbol{\theta})-r(\omega_{m_I}^{-1}X,\omega_{s_{\max}}^{-1}Y,\boldsymbol{\theta})f(X,Y,\boldsymbol{\theta})\big).
\end{aligned}
\tag{19}
$$

3) Integrating all the constraints

We finally define the constraint system as a relation generator $\mathcal{R}$. The relation generator takes as input a security parameter $\lambda$, a subcircuit library $\mathcal{L}\subset\mathbb{F}[X]$, and permutation polynomials $s^{(0)},s^{(1)},s^{(2)}\in\mathbb{F}[X,Y]$ and generates a polynomial-time decidable binary relation $R$, which is a set of pairs of instance and witness $(\mathbf{a},(\mathbf{b}(Y),\mathbf{c}(Y)))$, where

$$
\begin{aligned}
\mathbf{a}&:=\big(d_0^{(0)},\cdots,d_{l_{\text{in}}-1}^{(0)},d_{l_{\text{in}}}^{(s_{\max}-1)},\cdots,d_{l-1}^{(s_{\max}-1)}\big),\\
\mathbf{b}(Y)&:=\big(b_0(Y),\cdots,b_{l_D-l-1}(Y)\big),\\
\mathbf{c}(Y)&:=\big(c_0(Y),\cdots,c_{m_D-l_D-1}(Y)\big),
\end{aligned}
$$

such that (12) and (18) hold. In other words, $R\subseteq\mathbb{F}^l\times\mathbb{F}^{m_D-l}[Y]$ is constructed as

$$
R=
\left\{
(\mathbf{a},(\mathbf{b}(Y),\mathbf{c}(Y)))
\quad\mid\quad
\left[
\forall x\in\{\omega_n^i\}_{i=0}^{n-1},\ \forall y\in\{\omega_{s_{\max}}^i\}_{i=0}^{s_{\max}-1},\ \forall z\in\{\omega_{m_I}^i\}_{i=0}^{m_I-1},
\left[
p_0(x,y)=0,\ p_i(z,y)=0\ \text{for } i=1,2,3
\right]
\right]
\right\}.
\tag{20}
$$

⸻

3.3 Setup of subcircuit library

Our back-end protocol that will be defined in the next section relies on a probabilistic algorithm Setup for $R$ that produces an encoded reference string $\sigma$ of the library subcircuit polynomials in $\mathcal{L}$. Parties of the back-end protocol will be enforced to use $\sigma$, by which a prover can compress a claim statement $(\mathbf{a},(\mathbf{b}(Y),\mathbf{c}(Y)))$ for $R$ into proof of a small size. A verifier can be convinced by $\sigma$ that the counterparty is disputing a circuit derived from the same library $\mathcal{L}$. Also, randomness in $\sigma$ keeps $(\mathbf{a},(\mathbf{b}(Y),\mathbf{c}(Y)))$ extractable from the compression.

However, Setup may not include permutation polynomials $\{s^{(0)},s^{(1)},s^{(2)}\}$, when leaving the parties to commit to them by themselves grants universality to the back-end protocol. In special cases where universality is guaranteed even if the permutation polynomials are fixed, we can consider appending them to the reference string. Section 6 will illustrate one of these cases, verifiable machine computation.

In addition to the previously defined Lagrange bases $\{K_i\}_{i=0}^{m_I-1}$ and $\{L_i\}_{i=0}^{s_{\max}-1}$, we define another Lagrange bases $\{M_i\}_{i=0}^{l-1}\subset\mathbb{F}[X]$ such that $M_i(\omega_n^i)=1$ and $M_k(\omega_n^i)=0$ for every $i\neq k$.

Setup(pp_\lambda,\mathcal{L}) takes as input the bilinear pairing group $pp_\lambda$ and the subcircuit library $\mathcal{L}=\{u_j(X),v_j(X),w_j(X)\}_{j=0}^{m_D-1}$, randomly picks trapdoors

$$
\tau:=(\alpha,\gamma,\delta,\eta,x,y)\in(\mathbb{F}^*)^6,
\tag{21}
$$

computes, for every $j\in\{0,\cdots,m_D-1\}$,

$$
o_j(X):=\alpha u_j(X)+\alpha^2 v_j(X)+\alpha^3 w_j(X),
$$

and returns $\sigma=([\sigma_{A,C}]_1,[\sigma_B]_1,[\sigma_V]_2)$, where

$$
\sigma_{A,C}:=\left(\{x^h y^i\}_{h=0,i=0}^{\max(2n-2,3m_I-3),\,2s_{\max}-2}\right),
$$

$$
\sigma_B:=
\left(
\begin{array}{l}
\delta,\eta,\\
\left\{\gamma^{-1}\big(L_0(y)o_j(x)+M_j(x)\big)\right\}_{j=0}^{l_{\text{in}}-1},\\
\left\{\gamma^{-1}\big(L_{-1}(y)o_j(x)+M_j(x)\big)\right\}_{j=l_{\text{in}}}^{l-1},\\
\left\{\eta^{-1}L_i(y)\big(o_{j+l}(x)+\alpha^4 K_j(x)\big)\right\}_{i=0,j=0}^{s_{\max}-1,m_I-1},\\
\left\{\delta^{-1}L_i(y)o_j(x)\right\}_{i=0,j=l+m_I}^{s_{\max}-1,m_D-1},\\
\left\{\delta^{-1}\alpha^k x^h t_n(x)\right\}_{h=0,k=1}^{2,3},\\
\left\{\delta^{-1}\alpha^4 x^j t_{m_I}(x)\right\}_{j=0}^{l-1},\\
\left\{\delta^{-1}\alpha^k y^i t_{s_{\max}}(y)\right\}_{i=0,k=1}^{2,4}
\end{array}
\right),
$$

$$
\sigma_V:=\left(\alpha,\alpha^2,\alpha^3,\alpha^4,\gamma,\delta,\eta,x,y\right).
$$
