use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use solana_instructions_sysvar::{
    load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_SYSVAR_ID,
};
use solana_sdk_ids::ed25519_program;

declare_id!("3wLUimZ83C6X1NTQaN6uoDAE8vLmk5oNu91bnruYcjxm");

pub const SALE_CONFIG_SEED: &[u8] = b"sale-config";
pub const SALE_VAULT_AUTHORITY_SEED: &[u8] = b"sale-vault-authority";
pub const SALE_VAULT_SEED: &[u8] = b"sale-vault";
pub const QUOTE_RECEIPT_SEED: &[u8] = b"quote-receipt";
pub const QUOTE_DOMAIN: &[u8; 34] = b"GTREE_FOUNDATION_PURCHASE_QUOTE_V1";
pub const QUOTE_FORMAT_VERSION: u8 = 1;
pub const LOCALNET_CLUSTER_ID: u8 = 1;
pub const INITIAL_CONFIG_VERSION: u16 = 1;
pub const MAX_ISSUED_AT_FUTURE_SECONDS: i64 = 5;
pub const CANONICAL_QUOTE_LEN: usize = 270;

#[program]
pub mod gtree_foundation_sale {
    use super::*;

    pub fn initialize_sale(ctx: Context<InitializeSale>, args: InitializeSaleArgs) -> Result<()> {
        validate_limits(args.min_purchase_lamports, args.max_purchase_lamports)?;
        require!(
            args.max_quote_age_seconds > 0,
            SaleError::InvalidMaxQuoteAge
        );
        require!(
            args.quote_authority != Pubkey::default(),
            SaleError::InvalidQuoteAuthority
        );

        let config = &mut ctx.accounts.sale_config;
        config.authority = ctx.accounts.authority.key();
        config.treasury_recipient = ctx.accounts.treasury_recipient.key();
        config.token_mint = ctx.accounts.token_mint.key();
        config.sale_vault = ctx.accounts.sale_vault.key();
        config.quote_authority = args.quote_authority;
        config.min_purchase_lamports = args.min_purchase_lamports;
        config.max_purchase_lamports = args.max_purchase_lamports;
        config.max_quote_age_seconds = args.max_quote_age_seconds;
        config.total_tokens_sold = 0;
        config.total_lamports_collected = 0;
        config.paused = args.paused;
        config.config_version = INITIAL_CONFIG_VERSION;
        config.config_bump = ctx.bumps.sale_config;
        config.vault_authority_bump = ctx.bumps.vault_authority;
        config.sale_vault_bump = ctx.bumps.sale_vault;

        emit!(SaleInitialized {
            sale_config: config.key(),
            authority: config.authority,
            treasury_recipient: config.treasury_recipient,
            token_mint: config.token_mint,
            sale_vault: config.sale_vault,
            quote_authority: config.quote_authority,
            config_version: config.config_version,
            paused: config.paused,
        });
        Ok(())
    }

    pub fn fund_sale_vault(ctx: Context<FundSaleVault>, amount: u64) -> Result<()> {
        require!(amount > 0, SaleError::ZeroTokenAmount);
        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.source_token_account.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.sale_vault.to_account_info(),
                    authority: ctx.accounts.funding_authority.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.token_mint.decimals,
        )?;
        Ok(())
    }

    pub fn purchase_with_quote(
        ctx: Context<PurchaseWithQuote>,
        quote: PurchaseQuote,
    ) -> Result<()> {
        let sale_config_key = ctx.accounts.sale_config.key();
        let buyer_key = ctx.accounts.buyer.key();
        let config = &mut ctx.accounts.sale_config;
        require!(!config.paused, SaleError::SalePaused);
        require!(quote.input_lamports > 0, SaleError::ZeroPurchase);
        require!(
            quote.output_token_base_units > 0,
            SaleError::ZeroTokenOutput
        );
        require!(
            quote.minimum_output_token_base_units > 0
                && quote.output_token_base_units >= quote.minimum_output_token_base_units,
            SaleError::MinimumOutputNotMet
        );
        require!(
            quote.input_lamports >= config.min_purchase_lamports,
            SaleError::BelowMinimumPurchase
        );
        require!(
            quote.input_lamports <= config.max_purchase_lamports,
            SaleError::AboveMaximumPurchase
        );

        validate_quote_bindings(&quote, config, sale_config_key, buyer_key)?;
        validate_quote_timestamps(&quote, config, Clock::get()?.unix_timestamp)?;

        let canonical_message = quote.to_canonical_bytes();
        verify_ed25519_instruction(
            &ctx.accounts.instructions_sysvar.to_account_info(),
            &config.quote_authority,
            &canonical_message,
        )?;

        require!(
            ctx.accounts.sale_vault.amount >= quote.output_token_base_units,
            SaleError::InsufficientInventory
        );
        let next_tokens_sold = config
            .total_tokens_sold
            .checked_add(quote.output_token_base_units)
            .ok_or(SaleError::ArithmeticOverflow)?;
        let next_lamports_collected = config
            .total_lamports_collected
            .checked_add(quote.input_lamports)
            .ok_or(SaleError::ArithmeticOverflow)?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury_recipient.to_account_info(),
                },
            ),
            quote.input_lamports,
        )?;

        let sale_config_key = config.key();
        let vault_bump = [config.vault_authority_bump];
        let vault_signer_seeds: &[&[u8]] = &[
            SALE_VAULT_AUTHORITY_SEED,
            sale_config_key.as_ref(),
            &vault_bump,
        ];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.sale_vault.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &[vault_signer_seeds],
            ),
            quote.output_token_base_units,
            ctx.accounts.token_mint.decimals,
        )?;

        let receipt = &mut ctx.accounts.quote_receipt;
        receipt.sale_config = config.key();
        receipt.quote_id = quote.quote_id;
        receipt.buyer = ctx.accounts.buyer.key();
        receipt.input_lamports = quote.input_lamports;
        receipt.output_token_base_units = quote.output_token_base_units;
        receipt.executed_at = Clock::get()?.unix_timestamp;
        receipt.bump = ctx.bumps.quote_receipt;

        config.total_tokens_sold = next_tokens_sold;
        config.total_lamports_collected = next_lamports_collected;

        emit!(QuotePurchaseCompleted {
            quote_id: quote.quote_id,
            sale_config: config.key(),
            buyer: ctx.accounts.buyer.key(),
            quote_authority: config.quote_authority,
            lamports_paid: quote.input_lamports,
            tokens_received: quote.output_token_base_units,
            issued_at: quote.issued_at,
            expiry: quote.expiry,
            executed_at: receipt.executed_at,
            total_tokens_sold: config.total_tokens_sold,
            total_lamports_collected: config.total_lamports_collected,
        });
        Ok(())
    }

    pub fn pause_sale(ctx: Context<ManageSale>) -> Result<()> {
        ctx.accounts.sale_config.paused = true;
        Ok(())
    }

    pub fn resume_sale(ctx: Context<ManageSale>) -> Result<()> {
        ctx.accounts.sale_config.paused = false;
        Ok(())
    }

    pub fn update_limits(ctx: Context<ManageSale>, minimum: u64, maximum: u64) -> Result<()> {
        validate_limits(minimum, maximum)?;
        let config = &mut ctx.accounts.sale_config;
        config.min_purchase_lamports = minimum;
        config.max_purchase_lamports = maximum;
        config.config_version = config
            .config_version
            .checked_add(1)
            .ok_or(SaleError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn rotate_quote_authority(
        ctx: Context<ManageSale>,
        new_quote_authority: Pubkey,
    ) -> Result<()> {
        require!(
            new_quote_authority != Pubkey::default(),
            SaleError::InvalidQuoteAuthority
        );
        let config = &mut ctx.accounts.sale_config;
        config.quote_authority = new_quote_authority;
        config.config_version = config
            .config_version
            .checked_add(1)
            .ok_or(SaleError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn withdraw_unsold_tokens(ctx: Context<WithdrawUnsoldTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, SaleError::ZeroTokenAmount);
        require!(
            ctx.accounts.sale_vault.amount >= amount,
            SaleError::InsufficientInventory
        );
        let sale_config_key = ctx.accounts.sale_config.key();
        let vault_bump = [ctx.accounts.sale_config.vault_authority_bump];
        let vault_signer_seeds: &[&[u8]] = &[
            SALE_VAULT_AUTHORITY_SEED,
            sale_config_key.as_ref(),
            &vault_bump,
        ];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.sale_vault.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.destination_token_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &[vault_signer_seeds],
            ),
            amount,
            ctx.accounts.token_mint.decimals,
        )?;
        Ok(())
    }
}

fn validate_limits(minimum: u64, maximum: u64) -> Result<()> {
    require!(minimum > 0 && maximum >= minimum, SaleError::InvalidLimits);
    Ok(())
}

fn validate_quote_bindings(
    quote: &PurchaseQuote,
    config: &SaleConfig,
    sale_config_key: Pubkey,
    buyer_key: Pubkey,
) -> Result<()> {
    require!(quote.domain == *QUOTE_DOMAIN, SaleError::InvalidQuoteDomain);
    require!(
        quote.quote_format_version == QUOTE_FORMAT_VERSION,
        SaleError::InvalidQuoteVersion
    );
    require!(
        quote.cluster_id == LOCALNET_CLUSTER_ID,
        SaleError::InvalidCluster
    );
    require!(
        quote.config_version == config.config_version,
        SaleError::InvalidConfigVersion
    );
    require_keys_eq!(quote.program_id, crate::ID, SaleError::InvalidProgramId);
    require_keys_eq!(
        quote.sale_config,
        sale_config_key,
        SaleError::InvalidSaleConfig
    );
    require_keys_eq!(quote.token_mint, config.token_mint, SaleError::InvalidMint);
    require_keys_eq!(
        quote.treasury_recipient,
        config.treasury_recipient,
        SaleError::InvalidTreasuryRecipient
    );
    require_keys_eq!(quote.buyer, buyer_key, SaleError::InvalidBuyer);
    Ok(())
}

fn validate_quote_timestamps(quote: &PurchaseQuote, config: &SaleConfig, now: i64) -> Result<()> {
    let maximum_future = now
        .checked_add(MAX_ISSUED_AT_FUTURE_SECONDS)
        .ok_or(SaleError::ArithmeticOverflow)?;
    require!(
        quote.issued_at <= maximum_future,
        SaleError::QuoteIssuedInFuture
    );
    require!(quote.expiry >= quote.issued_at, SaleError::InvalidQuoteTime);
    require!(now <= quote.expiry, SaleError::QuoteExpired);
    let quote_lifetime = quote
        .expiry
        .checked_sub(quote.issued_at)
        .ok_or(SaleError::ArithmeticOverflow)?;
    let quote_lifetime = u64::try_from(quote_lifetime).map_err(|_| SaleError::InvalidQuoteTime)?;
    require!(
        quote_lifetime <= config.max_quote_age_seconds,
        SaleError::QuoteAgeExceeded
    );
    Ok(())
}

fn read_u16_le(data: &[u8], offset: usize) -> Result<u16> {
    let bytes: [u8; 2] = data
        .get(offset..offset + 2)
        .ok_or_else(|| error!(SaleError::MalformedEd25519Instruction))?
        .try_into()
        .map_err(|_| error!(SaleError::MalformedEd25519Instruction))?;
    Ok(u16::from_le_bytes(bytes))
}

fn verify_ed25519_instruction(
    instructions_sysvar: &AccountInfo,
    expected_signer: &Pubkey,
    expected_message: &[u8],
) -> Result<()> {
    let current_index = load_current_index_checked(instructions_sysvar)?;
    require!(current_index > 0, SaleError::MissingEd25519Instruction);
    let ed25519_instruction =
        load_instruction_at_checked(usize::from(current_index - 1), instructions_sysvar)?;
    require_keys_eq!(
        ed25519_instruction.program_id,
        ed25519_program::ID,
        SaleError::MissingEd25519Instruction
    );
    require!(
        ed25519_instruction.accounts.is_empty(),
        SaleError::MalformedEd25519Instruction
    );

    let data = ed25519_instruction.data.as_slice();
    require!(
        data.len() >= 16 && data[0] == 1 && data[1] == 0,
        SaleError::MalformedEd25519Instruction
    );
    let signature_offset = usize::from(read_u16_le(data, 2)?);
    let signature_instruction_index = read_u16_le(data, 4)?;
    let public_key_offset = usize::from(read_u16_le(data, 6)?);
    let public_key_instruction_index = read_u16_le(data, 8)?;
    let message_offset = usize::from(read_u16_le(data, 10)?);
    let message_size = usize::from(read_u16_le(data, 12)?);
    let message_instruction_index = read_u16_le(data, 14)?;

    require!(
        signature_instruction_index == u16::MAX
            && public_key_instruction_index == u16::MAX
            && message_instruction_index == current_index
            && message_offset == 8
            && message_size == CANONICAL_QUOTE_LEN,
        SaleError::MalformedEd25519Instruction
    );
    data.get(signature_offset..signature_offset + 64)
        .ok_or_else(|| error!(SaleError::MalformedEd25519Instruction))?;
    let public_key = data
        .get(public_key_offset..public_key_offset + 32)
        .ok_or_else(|| error!(SaleError::MalformedEd25519Instruction))?;
    let message_instruction =
        load_instruction_at_checked(usize::from(message_instruction_index), instructions_sysvar)?;
    require_keys_eq!(
        message_instruction.program_id,
        crate::ID,
        SaleError::MalformedEd25519Instruction
    );
    let message = message_instruction
        .data
        .get(message_offset..message_offset + message_size)
        .ok_or_else(|| error!(SaleError::MalformedEd25519Instruction))?;
    require!(
        public_key == expected_signer.as_ref(),
        SaleError::InvalidQuoteAuthority
    );
    require!(message == expected_message, SaleError::QuoteMessageMismatch);
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct InitializeSaleArgs {
    pub quote_authority: Pubkey,
    pub min_purchase_lamports: u64,
    pub max_purchase_lamports: u64,
    pub max_quote_age_seconds: u64,
    pub paused: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct PurchaseQuote {
    pub domain: [u8; 34],
    pub quote_format_version: u8,
    pub cluster_id: u8,
    pub config_version: u16,
    pub program_id: Pubkey,
    pub sale_config: Pubkey,
    pub token_mint: Pubkey,
    pub treasury_recipient: Pubkey,
    pub buyer: Pubkey,
    pub input_lamports: u64,
    pub output_token_base_units: u64,
    pub minimum_output_token_base_units: u64,
    pub issued_at: i64,
    pub expiry: i64,
    pub quote_id: [u8; 32],
}

impl PurchaseQuote {
    // Canonical binary layout (270 bytes, no JSON and no length prefixes):
    // domain[34] | quote_version:u8 | cluster_id:u8 | config_version:u16 LE |
    // program_id[32] | sale_config[32] | token_mint[32] | treasury[32] |
    // buyer[32] | input_lamports:u64 LE | output_base_units:u64 LE |
    // minimum_output_base_units:u64 LE | issued_at:i64 LE | expiry:i64 LE |
    // quote_id[32]. The TypeScript signer uses this exact field order and encoding.
    pub fn to_canonical_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(CANONICAL_QUOTE_LEN);
        bytes.extend_from_slice(&self.domain);
        bytes.push(self.quote_format_version);
        bytes.push(self.cluster_id);
        bytes.extend_from_slice(&self.config_version.to_le_bytes());
        bytes.extend_from_slice(self.program_id.as_ref());
        bytes.extend_from_slice(self.sale_config.as_ref());
        bytes.extend_from_slice(self.token_mint.as_ref());
        bytes.extend_from_slice(self.treasury_recipient.as_ref());
        bytes.extend_from_slice(self.buyer.as_ref());
        bytes.extend_from_slice(&self.input_lamports.to_le_bytes());
        bytes.extend_from_slice(&self.output_token_base_units.to_le_bytes());
        bytes.extend_from_slice(&self.minimum_output_token_base_units.to_le_bytes());
        bytes.extend_from_slice(&self.issued_at.to_le_bytes());
        bytes.extend_from_slice(&self.expiry.to_le_bytes());
        bytes.extend_from_slice(&self.quote_id);
        bytes
    }
}

#[derive(Accounts)]
pub struct InitializeSale<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub treasury_recipient: SystemAccount<'info>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + SaleConfig::LEN,
        seeds = [SALE_CONFIG_SEED, token_mint.key().as_ref()],
        bump,
    )]
    pub sale_config: Box<Account<'info, SaleConfig>>,
    /// CHECK: PDA signs only for the scoped sale vault validated below.
    #[account(
        seeds = [SALE_VAULT_AUTHORITY_SEED, sale_config.key().as_ref()],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        seeds = [SALE_VAULT_SEED, sale_config.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = vault_authority,
    )]
    pub sale_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct FundSaleVault<'info> {
    #[account(mut)]
    pub funding_authority: Signer<'info>,
    #[account(
        seeds = [SALE_CONFIG_SEED, token_mint.key().as_ref()],
        bump = sale_config.config_bump,
        has_one = token_mint @ SaleError::InvalidMint,
        has_one = sale_vault @ SaleError::InvalidSaleVault,
    )]
    pub sale_config: Account<'info, SaleConfig>,
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        constraint = source_token_account.owner == funding_authority.key() @ SaleError::InvalidTokenOwner,
        constraint = source_token_account.mint == sale_config.token_mint @ SaleError::InvalidMint,
    )]
    pub source_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [SALE_VAULT_SEED, sale_config.key().as_ref()],
        bump = sale_config.sale_vault_bump,
        constraint = sale_vault.mint == sale_config.token_mint @ SaleError::InvalidMint,
        constraint = sale_vault.owner == vault_authority.key() @ SaleError::InvalidVaultAuthority,
    )]
    pub sale_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: PDA seeds and vault owner constrain this account.
    #[account(
        seeds = [SALE_VAULT_AUTHORITY_SEED, sale_config.key().as_ref()],
        bump = sale_config.vault_authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(quote: PurchaseQuote)]
pub struct PurchaseWithQuote<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [SALE_CONFIG_SEED, token_mint.key().as_ref()],
        bump = sale_config.config_bump,
        has_one = treasury_recipient @ SaleError::InvalidTreasuryRecipient,
        has_one = token_mint @ SaleError::InvalidMint,
        has_one = sale_vault @ SaleError::InvalidSaleVault,
    )]
    pub sale_config: Box<Account<'info, SaleConfig>>,
    #[account(mut)]
    pub treasury_recipient: SystemAccount<'info>,
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [SALE_VAULT_SEED, sale_config.key().as_ref()],
        bump = sale_config.sale_vault_bump,
        constraint = sale_vault.mint == sale_config.token_mint @ SaleError::InvalidMint,
        constraint = sale_vault.owner == vault_authority.key() @ SaleError::InvalidVaultAuthority,
    )]
    pub sale_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: PDA seeds and vault owner constrain this account.
    #[account(
        seeds = [SALE_VAULT_AUTHORITY_SEED, sale_config.key().as_ref()],
        bump = sale_config.vault_authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = token_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = buyer,
        space = 8 + QuoteReceipt::LEN,
        seeds = [QUOTE_RECEIPT_SEED, sale_config.key().as_ref(), quote.quote_id.as_ref()],
        bump,
    )]
    pub quote_receipt: Box<Account<'info, QuoteReceipt>>,
    /// CHECK: Address constraint requires the transaction Instructions Sysvar.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageSale<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [SALE_CONFIG_SEED, sale_config.token_mint.as_ref()],
        bump = sale_config.config_bump,
        has_one = authority @ SaleError::Unauthorized,
    )]
    pub sale_config: Account<'info, SaleConfig>,
}

#[derive(Accounts)]
pub struct WithdrawUnsoldTokens<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [SALE_CONFIG_SEED, token_mint.key().as_ref()],
        bump = sale_config.config_bump,
        has_one = authority @ SaleError::Unauthorized,
        has_one = token_mint @ SaleError::InvalidMint,
        has_one = sale_vault @ SaleError::InvalidSaleVault,
    )]
    pub sale_config: Account<'info, SaleConfig>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [SALE_VAULT_SEED, sale_config.key().as_ref()],
        bump = sale_config.sale_vault_bump,
        constraint = sale_vault.mint == sale_config.token_mint @ SaleError::InvalidMint,
        constraint = sale_vault.owner == vault_authority.key() @ SaleError::InvalidVaultAuthority,
    )]
    pub sale_vault: Account<'info, TokenAccount>,
    /// CHECK: PDA seeds and vault owner constrain this account.
    #[account(
        seeds = [SALE_VAULT_AUTHORITY_SEED, sale_config.key().as_ref()],
        bump = sale_config.vault_authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = destination_token_account.mint == sale_config.token_mint @ SaleError::InvalidMint,
    )]
    pub destination_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct SaleConfig {
    pub authority: Pubkey,
    pub treasury_recipient: Pubkey,
    pub token_mint: Pubkey,
    pub sale_vault: Pubkey,
    pub quote_authority: Pubkey,
    pub min_purchase_lamports: u64,
    pub max_purchase_lamports: u64,
    pub max_quote_age_seconds: u64,
    pub total_tokens_sold: u64,
    pub total_lamports_collected: u64,
    pub paused: bool,
    pub config_version: u16,
    pub config_bump: u8,
    pub vault_authority_bump: u8,
    pub sale_vault_bump: u8,
}

impl SaleConfig {
    pub const LEN: usize = (32 * 5) + (8 * 5) + 1 + 2 + 3;
}

#[account]
pub struct QuoteReceipt {
    pub sale_config: Pubkey,
    pub quote_id: [u8; 32],
    pub buyer: Pubkey,
    pub input_lamports: u64,
    pub output_token_base_units: u64,
    pub executed_at: i64,
    pub bump: u8,
}

impl QuoteReceipt {
    pub const LEN: usize = (32 * 3) + (8 * 3) + 1;
}

#[event]
pub struct SaleInitialized {
    pub sale_config: Pubkey,
    pub authority: Pubkey,
    pub treasury_recipient: Pubkey,
    pub token_mint: Pubkey,
    pub sale_vault: Pubkey,
    pub quote_authority: Pubkey,
    pub config_version: u16,
    pub paused: bool,
}

#[event]
pub struct QuotePurchaseCompleted {
    pub quote_id: [u8; 32],
    pub sale_config: Pubkey,
    pub buyer: Pubkey,
    pub quote_authority: Pubkey,
    pub lamports_paid: u64,
    pub tokens_received: u64,
    pub issued_at: i64,
    pub expiry: i64,
    pub executed_at: i64,
    pub total_tokens_sold: u64,
    pub total_lamports_collected: u64,
}

#[error_code]
pub enum SaleError {
    #[msg("The sale is paused.")]
    SalePaused,
    #[msg("Purchase amount must be greater than zero.")]
    ZeroPurchase,
    #[msg("Purchase amount is below the configured minimum.")]
    BelowMinimumPurchase,
    #[msg("Purchase amount is above the configured maximum.")]
    AboveMaximumPurchase,
    #[msg("Purchase limits are invalid.")]
    InvalidLimits,
    #[msg("Maximum quote age must be greater than zero.")]
    InvalidMaxQuoteAge,
    #[msg("Checked arithmetic failed.")]
    ArithmeticOverflow,
    #[msg("Quoted token output must be greater than zero.")]
    ZeroTokenOutput,
    #[msg("Quoted output is below the signed minimum output.")]
    MinimumOutputNotMet,
    #[msg("The sale vault does not have enough inventory.")]
    InsufficientInventory,
    #[msg("Only the configured sale authority may perform this action.")]
    Unauthorized,
    #[msg("The quote authority is invalid.")]
    InvalidQuoteAuthority,
    #[msg("The token mint does not match the sale configuration.")]
    InvalidMint,
    #[msg("The sale vault does not match the sale configuration.")]
    InvalidSaleVault,
    #[msg("The sale vault authority is invalid.")]
    InvalidVaultAuthority,
    #[msg("The treasury recipient does not match the sale configuration.")]
    InvalidTreasuryRecipient,
    #[msg("The token-account owner is invalid.")]
    InvalidTokenOwner,
    #[msg("The buyer does not match the signed quote.")]
    InvalidBuyer,
    #[msg("The signed quote targets a different sale configuration.")]
    InvalidSaleConfig,
    #[msg("The signed quote targets a different program.")]
    InvalidProgramId,
    #[msg("The quote domain separator is invalid.")]
    InvalidQuoteDomain,
    #[msg("The quote format version is invalid.")]
    InvalidQuoteVersion,
    #[msg("The quote targets a different Solana cluster.")]
    InvalidCluster,
    #[msg("The quote configuration version is no longer current.")]
    InvalidConfigVersion,
    #[msg("The quote has expired.")]
    QuoteExpired,
    #[msg("The quote was issued too far in the future.")]
    QuoteIssuedInFuture,
    #[msg("The quote timestamps are invalid.")]
    InvalidQuoteTime,
    #[msg("The signed quote lifetime exceeds the configured maximum.")]
    QuoteAgeExceeded,
    #[msg("A preceding Ed25519 verification instruction is required.")]
    MissingEd25519Instruction,
    #[msg("The Ed25519 verification instruction is malformed.")]
    MalformedEd25519Instruction,
    #[msg("The verified Ed25519 message does not match the purchase quote.")]
    QuoteMessageMismatch,
    #[msg("Token amount must be greater than zero.")]
    ZeroTokenAmount,
}
